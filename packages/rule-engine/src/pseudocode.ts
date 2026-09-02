/**
 * المحلل المنطقي — من النص البرمجي إلى JSON Logic
 *
 * المرجع: ملف "محرك الربط المنطقي – JSON Logic" (operations/conditions)
 * + مخطط البلدية (logic: "if violation_type == 'serious' then max_fine = 1000000 else ...").
 *
 * يحوّل صيغتين إلى شجرة JSON Logic قابلة للتنفيذ:
 *  1) الصيغة الرسمية: { operation, params } أو { conditions: [{ if, then, else }] }
 *  2) صيغة النص التوليفي: "if X == 'y' then A = 1 else B = 2"
 */

import jsonLogic from 'json-logic-js';

/** مرجع متغير بصيغة {{var}} */
export function resolveRef(value: unknown, data: Record<string, unknown>): unknown {
  if (typeof value !== 'string') return value;
  const m = /^\{\{([a-zA-Z0-9_.]+)\}\}$/.exec(value.trim());
  if (!m) return value;
  return m[1].split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);
}

/** تحليل شرط نصي بسيط: left op right */
const SIMPLE_CONDITION =
  /^\s*([a-zA-Z0-9_.]+)\s*(==|!=|>=|<=|>|<)\s*('([^']*)'|"([^"]*)"|([0-9.]+)|(true|false))\s*$/;

function parseSimpleCondition(expr: string): unknown | null {
  const m = SIMPLE_CONDITION.exec(expr);
  if (!m) return null;
  const [, left, op, , strVal, dqVal, numVal, boolVal] = m;
  const rightRaw = strVal ?? dqVal ?? numVal ?? boolVal;
  const right = boolVal === 'true' ? true : boolVal === 'false' ? false : numVal ? Number(numVal) : rightRaw;
  const jsonLogicOps: Record<string, string> = {
    '==': '==',
    '!=': '!=',
    '>=': '>=',
    '<=': '<=',
    '>': '>',
    '<': '<',
  };
  return { [jsonLogicOps[op]]: [{ var: left }, right] };
}

/** تقييم JSON Logic بأمان */
export function safeApply(logic: unknown, data: Record<string, unknown>): unknown {
  try {
    return jsonLogic.apply(logic, data);
  } catch {
    return undefined;
  }
}

export interface ParsedPseudocode {
  condition: unknown;
  thenAssignments: Record<string, unknown>;
  elseAssignments?: Record<string, unknown>;
}

/**
 * تحليل نص "if X then A = 1 else B = 2" إلى شروط JSON Logic.
 * يدعم AND صريحاً بصيغة "X AND Y".
 */
export function parseIfThenElse(script: string): ParsedPseudocode | null {
  const m = /^\s*if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+))?$/i.exec(script);
  if (!m) return null;
  const [, condRaw, thenRaw, elseRaw] = m;

  const condParts = condRaw.split(/\s+AND\s+/i).map((p) => p.trim());
  let condition: unknown;
  const parsed = condParts.map((p) => parseSimpleCondition(p)).filter(Boolean) as unknown[];
  condition = parsed.length === 1 ? parsed[0] : { and: parsed };

  return {
    condition,
    thenAssignments: parseAssignments(thenRaw),
    elseAssignments: elseRaw ? parseAssignments(elseRaw) : undefined,
  };
}

/** تحليل "a = 1, b = 'x'" إلى خريطة إخراج */
function parseAssignments(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // فصل الفواصل إلا داخل علامات الاقتباس
  const parts = raw.split(/,\s*(?=(?:[^']*'[^']*')*[^']*$)/);
  for (const part of parts) {
    const eq = /^\s*([a-zA-Z0-9_.]+)\s*=\s*(.+?)\s*$/.exec(part);
    if (!eq) continue;
    const [, key, valueRaw] = eq;
    const v = valueRaw.trim();
    if (v.startsWith("'") && v.endsWith("'")) out[key] = v.slice(1, -1);
    else if (v === 'true') out[key] = true;
    else if (v === 'false') out[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(v)) out[key] = Number(v);
    else out[key] = v;
  }
  return out;
}

/**
 * تحويل الصيغة الرسمية { operation, params, conditions } إلى JSON Logic أو إخراج مباشر.
 *  - operation = add_days: يُنفَّذ مباشرة (دالة خارجية)
 *  - conditions: [{ if, then, else }] → تنفيذ تسلسلي
 */
export interface FormalLogic {
  operation?: string;
  params?: Record<string, unknown>;
  conditions?: Array<{
    if?: unknown;
    then?: Record<string, unknown>;
    else?: Record<string, unknown>;
  }>;
}

/** إضافة أيام على تاريخ (ISO) — دون تجاوز يوم الجمعة/السبت (عطل نهاية الأسبوع) */
export function addBusinessDays(baseDate: string, days: number): string {
  const d = new Date(baseDate);
  if (Number.isNaN(d.getTime())) return baseDate;
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 5 && dow !== 6) added += 1; // الجمعة 5، السبت 6
  }
  return d.toISOString().slice(0, 10);
}

/** الفرق بالأيام بين تاريخين */
export function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return NaN;
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

/** تعيين أسماء العمليات المخصصة (left/right) إلى مشغلات JSON Logic */
const CUSTOM_OP_TO_JSON_LOGIC: Record<string, string> = {
  less_or_equal: '<=',
  greater_or_equal: '>=',
  less_than: '<',
  greater_than: '>',
  equals: '==',
  not_equals: '!=',
};

/** تحويل مرجع {{var}} أو قيمة إلى معامل JSON Logic ({var}) */
function operandToJsonLogic(value: unknown): unknown {
  if (typeof value === 'string') {
    const m = /^\{\{([a-zA-Z0-9_.]+)\}\}$/.exec(value.trim());
    if (m) return { var: m[1] };
  }
  return value;
}

/**
 * تحويل شرط بلهجة left/right (أو and/ or) إلى صيغة JSON Logic قابلة للتنفيذ.
 * مثال:
 *   { less_or_equal: { left: '{{days}}', right: 30 } }
 *   → { '<=': [{ var: 'days' }, 30] }
 */
export function toJsonLogic(cond: unknown): unknown {
  if (!cond || typeof cond !== 'object') return cond;
  const obj = cond as Record<string, unknown>;

  // عامل ثنائي left/right مخصص
  for (const op of Object.keys(CUSTOM_OP_TO_JSON_LOGIC)) {
    if (op in obj) {
      const pair = obj[op] as { left?: unknown; right?: unknown } | undefined;
      if (pair && 'left' in pair && 'right' in pair) {
        return {
          [CUSTOM_OP_TO_JSON_LOGIC[op]]: [
            operandToJsonLogic(pair.left),
            operandToJsonLogic(pair.right),
          ],
        };
      }
    }
  }

  // وصلات منطقية
  if ('and' in obj) return { and: (obj.and as unknown[]).map(toJsonLogic) };
  if ('or' in obj) return { or: (obj.or as unknown[]).map(toJsonLogic) };
  if ('not' in obj) return { '!': toJsonLogic(obj.not) };

  // مرجع مباشر
  if ('var' in obj) return obj;
  if ('value' in obj) return obj.value;

  return cond;
}

/** تقييم شرط Formal بعد التحويل التلقائي إلى JSON Logic */
export function applyFormalCondition(cond: unknown, data: Record<string, unknown>): boolean {
  const converted = toJsonLogic(cond);
  const result = safeApply(converted, data);
  return result === true;
}
