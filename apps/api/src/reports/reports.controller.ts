import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME = 'application/pdf';

class MovementHistoryQueryDto {
  @IsOptional() @IsString() fileId?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() format?: string;
}

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('outstanding')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'All currently dispatched (outstanding) files' })
  async outstanding(@Query() q: ReportQueryDto, @CurrentUser() u: JwtPayload, @Res() res: any) {
    if (q.format === 'xlsx') {
      const buf = await this.service.outstandingXlsx(u);
      return res.header('Content-Type', XLSX_MIME)
        .header('Content-Disposition', 'attachment; filename="outstanding-files.xlsx"')
        .send(buf);
    }
    if (q.format === 'pdf') {
      const buf = await this.service.outstandingPdf(u);
      return res.header('Content-Type', PDF_MIME)
        .header('Content-Disposition', 'attachment; filename="outstanding-files.pdf"')
        .send(buf);
    }
    return res.send(await this.service.outstanding(u));
  }

  @Get('daily-dispatches')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Dispatches for a given date (defaults to today)' })
  async dailyDispatches(@Query() q: ReportQueryDto, @CurrentUser() u: JwtPayload, @Res() res: any) {
    const date = q.date ?? new Date().toISOString().slice(0, 10);
    if (q.format === 'xlsx') {
      const buf = await this.service.dailyDispatchesXlsx(u, date);
      return res.header('Content-Type', XLSX_MIME)
        .header('Content-Disposition', `attachment; filename="dispatches-${date}.xlsx"`)
        .send(buf);
    }
    if (q.format === 'pdf') {
      const buf = await this.service.dailyDispatchesPdf(u, date);
      return res.header('Content-Type', PDF_MIME)
        .header('Content-Disposition', `attachment; filename="dispatches-${date}.pdf"`)
        .send(buf);
    }
    return res.send(await this.service.dailyDispatches(u, date));
  }

  @Get('daily-returns')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Returns for a given date (defaults to today)' })
  async dailyReturns(@Query() q: ReportQueryDto, @CurrentUser() u: JwtPayload, @Res() res: any) {
    const date = q.date ?? new Date().toISOString().slice(0, 10);
    if (q.format === 'xlsx') {
      const buf = await this.service.dailyReturnsXlsx(u, date);
      return res.header('Content-Type', XLSX_MIME)
        .header('Content-Disposition', `attachment; filename="returns-${date}.xlsx"`)
        .send(buf);
    }
    if (q.format === 'pdf') {
      const buf = await this.service.dailyReturnsPdf(u, date);
      return res.header('Content-Type', PDF_MIME)
        .header('Content-Disposition', `attachment; filename="returns-${date}.pdf"`)
        .send(buf);
    }
    return res.send(await this.service.dailyReturns(u, date));
  }

  @Get('missing')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'All files currently flagged as MISSING' })
  async missing(@Query() q: ReportQueryDto, @CurrentUser() u: JwtPayload, @Res() res: any) {
    if (q.format === 'xlsx') {
      const buf = await this.service.missingFilesXlsx(u);
      return res.header('Content-Type', XLSX_MIME)
        .header('Content-Disposition', 'attachment; filename="missing-files.xlsx"')
        .send(buf);
    }
    if (q.format === 'pdf') {
      const buf = await this.service.missingFilesPdf(u);
      return res.header('Content-Type', PDF_MIME)
        .header('Content-Disposition', 'attachment; filename="missing-files.pdf"')
        .send(buf);
    }
    return res.send(await this.service.missingFiles(u));
  }

  @Get('by-department')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Count of dispatched files grouped by department' })
  async byDepartment(@Query() q: ReportQueryDto, @CurrentUser() u: JwtPayload, @Res() res: any) {
    if (q.format === 'xlsx') {
      const buf = await this.service.byDepartmentXlsx(u);
      return res.header('Content-Type', XLSX_MIME)
        .header('Content-Disposition', 'attachment; filename="files-by-department.xlsx"')
        .send(buf);
    }
    if (q.format === 'pdf') {
      const buf = await this.service.byDepartmentPdf(u);
      return res.header('Content-Type', PDF_MIME)
        .header('Content-Disposition', 'attachment; filename="files-by-department.pdf"')
        .send(buf);
    }
    return res.send(await this.service.byDepartment(u));
  }

  @Get('monthly')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Day-by-day dispatch and return counts for a month' })
  async monthly(@Query() q: ReportQueryDto, @CurrentUser() u: JwtPayload, @Res() res: any) {
    const now = new Date();
    const year = q.year ?? now.getFullYear();
    const month = q.month ?? now.getMonth() + 1;
    if (q.format === 'xlsx') {
      const buf = await this.service.monthlyStatsXlsx(u, year, month);
      return res.header('Content-Type', XLSX_MIME)
        .header('Content-Disposition', `attachment; filename="monthly-${year}-${String(month).padStart(2, '0')}.xlsx"`)
        .send(buf);
    }
    if (q.format === 'pdf') {
      const buf = await this.service.monthlyStatsPdf(u, year, month);
      return res.header('Content-Type', PDF_MIME)
        .header('Content-Disposition', `attachment; filename="monthly-${year}-${String(month).padStart(2, '0')}.pdf"`)
        .send(buf);
    }
    return res.send(await this.service.monthlyStats(u, year, month));
  }

  @Get('movement-history')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'File movement history (filter by fileId and/or date range)' })
  async movementHistory(@Query() q: MovementHistoryQueryDto, @CurrentUser() u: JwtPayload, @Res() res: any) {
    if (q.format === 'xlsx') {
      const buf = await this.service.movementHistoryXlsx(u, q.fileId, q.dateFrom, q.dateTo);
      return res.header('Content-Type', XLSX_MIME)
        .header('Content-Disposition', 'attachment; filename="movement-history.xlsx"')
        .send(buf);
    }
    if (q.format === 'pdf') {
      const buf = await this.service.movementHistoryPdf(u, q.fileId, q.dateFrom, q.dateTo);
      return res.header('Content-Type', PDF_MIME)
        .header('Content-Disposition', 'attachment; filename="movement-history.pdf"')
        .send(buf);
    }
    return res.send(await this.service.movementHistory(u, q.fileId, q.dateFrom, q.dateTo));
  }
}
