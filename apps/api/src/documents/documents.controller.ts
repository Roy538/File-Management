import {
  BadRequestException, Controller, Delete, Get, Param, Patch,
  Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { DocumentsService } from './documents.service';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { Body } from '@nestjs/common';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents in a folder or sub-divider' })
  listDocuments(@Query() q: ListDocumentsDto, @CurrentUser() u: JwtPayload) {
    return this.svc.listDocuments(q, u);
  }

  @Post('reindex-ocr')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Enqueue OCR extraction for all documents missing text' })
  reindexOcr() {
    return this.svc.reindexOcr();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document detail with all versions' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new document (multipart/form-data)' })
  async upload(@Req() req: any, @CurrentUser() u: JwtPayload) {
    if (!req.isMultipart?.()) throw new BadRequestException('Request must be multipart/form-data');

    const fields: Record<string, string> = {};
    let fileBuffer: Buffer | null = null;
    let fileName = 'document';
    let mimeType = 'application/octet-stream';

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        fileName = part.filename || 'document';
        mimeType = part.mimetype || 'application/octet-stream';
      } else {
        fields[(part as any).fieldname] = (part as any).value as string;
      }
    }

    if (!fileBuffer) throw new BadRequestException('No file included in request');

    return this.svc.upload({
      buffer: fileBuffer,
      fileName,
      mimeType,
      fileSize: fileBuffer.length,
      title: fields.title || fileName,
      folderId: fields.folderId,
      subDividerId: fields.subDividerId,
      documentTypeId: fields.documentTypeId,
      user: u,
    });
  }

  @Post(':id/versions')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new version of an existing document' })
  async uploadVersion(@Param('id') id: string, @Req() req: any, @CurrentUser() u: JwtPayload) {
    if (!req.isMultipart?.()) throw new BadRequestException('Request must be multipart/form-data');

    let fileBuffer: Buffer | null = null;
    let fileName = 'document';
    let mimeType = 'application/octet-stream';

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        fileName = part.filename || 'document';
        mimeType = part.mimetype || 'application/octet-stream';
      }
    }

    if (!fileBuffer) throw new BadRequestException('No file included in request');

    return this.svc.uploadVersion(id, { buffer: fileBuffer, fileName, mimeType, fileSize: fileBuffer.length, user: u });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change document status (check-in/out/hold/finalize/archive)' })
  changeStatus(@Param('id') id: string, @Body() dto: ChangeStatusDto, @CurrentUser() u: JwtPayload) {
    return this.svc.changeStatus(id, dto.status, u);
  }

  @Get(':id/versions/:versionId/download')
  @ApiOperation({ summary: 'Get a signed download URL for a document version' })
  getDownloadUrl(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.svc.getDownloadUrl(id, versionId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Soft-delete a document' })
  deleteDocument(@Param('id') id: string) {
    return this.svc.deleteDocument(id);
  }
}
