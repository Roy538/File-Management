import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ESignatureService } from './esignature.service';
import { CreateESignatureDto } from './dto/create-esignature.dto';

@ApiTags('esignature')
@Controller()
export class ESignatureController {
  constructor(private readonly svc: ESignatureService) {}

  @Post('esignature')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Create an e-signature request for a document' })
  create(@Body() dto: CreateESignatureDto) {
    return this.svc.create(dto);
  }

  @Get('documents/:documentId/esignature')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List e-signature requests for a document' })
  listForDocument(@Param('documentId') documentId: string) {
    return this.svc.listForDocument(documentId);
  }

  @Patch('esignature/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Cancel a pending e-signature request' })
  cancel(@Param('id') id: string) {
    return this.svc.cancel(id);
  }

  /**
   * Webhook from Documenso — NOT JWT-protected.
   * Signature verification uses HMAC-SHA256 with DOCUMENSO_WEBHOOK_SECRET.
   * Note: body is re-stringified from the parsed JSON; for production use
   * a raw body capture middleware for byte-perfect HMAC verification.
   */
  @Post('esignature/webhook')
  @ApiOperation({ summary: 'Documenso webhook receiver (no auth)' })
  async webhook(
    @Req() req: any,
    @Headers('x-documenso-signature') signature: string,
  ) {
    const raw = JSON.stringify(req.body ?? {});
    return this.svc.handleWebhook(raw, signature ?? '');
  }
}
