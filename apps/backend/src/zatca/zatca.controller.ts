/**
 * واجهة ZATCA — ZATCA Controller
 *
 *   POST /zatca/seal   — ختم فاتورة إلكترونية (UBL 2.1 + هاش + QR + ختم)
 *   POST /zatca/verify — التحقق من ختم فاتورة
 *
 * محمية بـ ScopeGuard. تُدار ضمن نطاق المنشأة.
 */

import { Body, Controller, HttpException, Post, Req } from '@nestjs/common';
import { ZatcaService } from './zatca.service';
import type { ZatcaInvoice } from '@lexops/zatca';

@Controller('zatca')
export class ZatcaController {
  constructor(private readonly zatcaService: ZatcaService) {}

  @Post('seal')
  seal(
    @Body() body: { invoice: ZatcaInvoice; prevChainHash?: string },
    @Req() req: { scopeGuard: { entityId?: string; userId: string; role: string } },
  ): Record<string, unknown> {
    if (!body?.invoice?.id || !body.invoice.lines?.length) {
      throw new HttpException(
        { success: false, message: 'invoice صالحة مطلوبة (id + lines)', data: null },
        400,
      );
    }
    const result = this.zatcaService.sealer.seal(body.invoice, body.prevChainHash);
    return {
      success: true,
      message: 'sealed',
      data: {
        invoiceId: result.invoiceId,
        invoiceHash: result.invoiceHash,
        qrBase64: result.qrBase64,
        seal: result.seal,
        timestamp: result.timestamp,
        hasProductionCsid: this.zatcaService.sealer.hasProductionCsid,
      },
    };
  }

  @Post('verify')
  verify(
    @Body()
    body: {
      invoice: ZatcaInvoice;
      seal: { invoiceHash: string; seal: string };
      prevChainHash?: string;
    },
  ): Record<string, unknown> {
    if (!body?.invoice || !body?.seal) {
      throw new HttpException(
        { success: false, message: 'invoice و seal مطلوبان', data: null },
        400,
      );
    }
    const valid = this.zatcaService.sealer.verify(body.invoice, body.seal, body.prevChainHash);
    return { success: true, message: valid ? 'valid' : 'invalid', data: { valid } };
  }
}
