-- ============================================================================
-- C9 PostgreSQL Triggers — ChainGuardian (PH-N4)
-- المرجع: USDS-02 + دليل البرمجة (DB Triggers) + SOCF
-- الحصانة التنفيذية: لا UPDATE ولا DELETE على سجل C9 إطلاقاً (Append-Only).
-- الحاكمة الجديدة:
--   1) BEFORE INSERT يتحقق من ربط prevHash بالكتلة السابقة (ChainGuardian)
--   2) حساب HMAC-SHA256 داخل الـ Trigger (ختم السيادة)
--   3) أي كسر في السلسلة أو محاولة تعديل/حذف → رفض فوري (SOV_950)
-- ============================================================================

-- تفعيل امتداد التشفير HMAC-SHA256
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) دالة منع التعديل/الحذف
CREATE OR REPLACE FUNCTION c9_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Immutable Record — يحظر تعديل أو حذف سجلات C9 (Append-Only). code=SOV_950'
        USING ERRCODE = '22000';  -- data_exception
END;
$$ LANGUAGE plpgsql;

-- 2) دالة ChainGuardian — تتحقق من ربط prevHash وتعيد حساب الهاش/الختم
CREATE OR REPLACE FUNCTION c9_chainguardian_insert()
RETURNS TRIGGER AS $$
DECLARE
    latest_hash    TEXT;
    expected_hash  TEXT;
    canonical      TEXT;
    seal_secret    TEXT;
BEGIN
    -- استخراج سر الختم (من متغير بيئة أو جدول إعداد — لا hardcoding)
    BEGIN
        seal_secret := current_setting('c9.seal_secret', true);
    EXCEPTION WHEN OTHERS THEN
        seal_secret := NULL;
    END;

    IF seal_secret IS NULL OR seal_secret = '' THEN
        RAISE EXCEPTION 'c9.seal_secret غير معرّف — يتطلب Secret Manager' USING ERRCODE = '22000';
    END IF;

    -- أحدث كتلة للمنشأة
    SELECT block_hash INTO latest_hash
      FROM c9_ledger
     WHERE entity_id = NEW.entity_id
     ORDER BY block_index DESC
     LIMIT 1;

    -- Genesis: أول كتلة
    IF NEW.prev_hash = 'genesis-lexops-700' THEN
        IF latest_hash IS NOT NULL THEN
            RAISE EXCEPTION 'Genesis مكرر — لا يجوز إعادة تهيئة السلسلة' USING ERRCODE = '22000';
        END IF;
    ELSE
        -- الربط الحاكم: prevHash يجب أن يطابق ذيل السلسلة الحالية
        IF latest_hash IS NULL OR latest_hash <> NEW.prev_hash THEN
            RAISE EXCEPTION 'ChainGuardian: prevHash لا يطابق ذيل السلسلة (كسر محتمل)' USING ERRCODE = '22000';
        END IF;
    END IF;

    -- البناء الكنسي + إعادة حساب الهاش (تطابق طبقة TypeScript)
    canonical := NEW.block_index || '|' ||
                 NEW.event_id || '|' ||
                 NEW.entity_id || '|' ||
                 NEW.event_type || '|' ||
                 NEW.payload_json::text || '|' ||
                 NEW.actor_id || '|' ||
                 COALESCE(NEW.prev_hash, 'genesis-lexops-700');
    expected_hash := encode(digest(canonical, 'sha256'), 'hex');

    IF NEW.block_hash <> expected_hash THEN
        RAISE EXCEPTION 'ChainGuardian: block_hash لا يطابق البناء الكنسي (تلاعب)' USING ERRCODE = '22000';
    END IF;

    -- ختم HMAC-SHA256 السيادي
    IF NEW.seal <> encode(hmac(canonical, seal_secret, 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'ChainGuardian: الختم HMAC غير صحيح' USING ERRCODE = '22000';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) جدول سجل C9 (مثال مرجعي)
CREATE TABLE IF NOT EXISTS c9_ledger (
    block_index     BIGSERIAL PRIMARY KEY,
    entity_id       TEXT        NOT NULL,
    event_id        TEXT        NOT NULL,
    event_type      TEXT        NOT NULL,
    payload_json    JSONB       NOT NULL,
    actor_id        TEXT        NOT NULL,
    prev_hash       TEXT        NOT NULL,
    block_hash      TEXT        NOT NULL,
    seal            TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_id, event_id)
);

-- 4) المشغلات الحارسة
DROP TRIGGER IF EXISTS c9_no_update ON c9_ledger;
CREATE TRIGGER c9_no_update
    BEFORE UPDATE ON c9_ledger
    FOR EACH ROW EXECUTE FUNCTION c9_prevent_mutation();

DROP TRIGGER IF EXISTS c9_no_delete ON c9_ledger;
CREATE TRIGGER c9_no_delete
    BEFORE DELETE ON c9_ledger
    FOR EACH ROW EXECUTE FUNCTION c9_prevent_mutation();

DROP TRIGGER IF EXISTS c9_chainguardian_insert ON c9_ledger;
CREATE TRIGGER c9_chainguardian_insert
    BEFORE INSERT ON c9_ledger
    FOR EACH ROW EXECUTE FUNCTION c9_chainguardian_insert();

-- 5) تسريع سلسلة الهاشات
CREATE INDEX IF NOT EXISTS idx_c9_ledger_entity ON c9_ledger (entity_id, block_index);
