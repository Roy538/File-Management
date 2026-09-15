import {
  BadRequestException, Controller, Get, Param, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversionService, UploadedFile } from './conversion.service';

@ApiTags('conversion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversion')
export class ConversionController {
  constructor(private readonly svc: ConversionService) {}

  @Get('tools')
  @ApiOperation({ summary: 'List available conversion tools and their options' })
  listTools() {
    return this.svc.listTools();
  }

  @Get('engine')
  @ApiOperation({ summary: 'Report which conversion engine is active (LibreOffice vs pure-JS)' })
  engine() {
    return this.svc.engineStatus();
  }

  @Post(':tool')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Run a conversion tool on uploaded file(s); returns the converted file' })
  async run(
    @Param('tool') tool: string,
    @Req() req: any,
    @Res() reply: any,
    @Query() query: Record<string, string>,
  ) {
    if (!req.isMultipart?.()) throw new BadRequestException('Request must be multipart/form-data');

    const files: UploadedFile[] = [];
    const options: Record<string, string> = { ...query };

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        files.push({
          buffer,
          fileName: part.filename || 'file',
          mimeType: part.mimetype || 'application/octet-stream',
        });
      } else {
        options[(part as any).fieldname] = String((part as any).value ?? '');
      }
    }

    const result = await this.svc.convert(tool, files, options);

    reply
      .header('Content-Type', result.mimeType)
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName)}"`)
      .header('Content-Length', result.buffer.length)
      .header('Access-Control-Expose-Headers', 'Content-Disposition')
      .send(result.buffer);
  }
}
