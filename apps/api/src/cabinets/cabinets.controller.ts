import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CabinetsService } from './cabinets.service';
import { CreateCabinetDto } from './dto/create-cabinet.dto';
import { UpdateCabinetDto } from './dto/update-cabinet.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreateSubDividerDto } from './dto/create-sub-divider.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { SetAclDto } from './dto/set-acl.dto';
import { CreateRetentionPolicyDto } from './dto/create-retention-policy.dto';
import { CreateFromTemplateDto } from './dto/create-from-template.dto';
import { MoveFolderDto } from './dto/move-folder.dto';
import { MoveSubDividerDto } from './dto/move-sub-divider.dto';
import { UpdateNameDto } from './dto/update-name.dto';

@ApiTags('cabinets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CabinetsController {
  constructor(private readonly svc: CabinetsService) {}

  // ── Retention Policies ────────────────────────────────────────────────────

  @Get('retention-policies')
  listRetentionPolicies() {
    return this.svc.listRetentionPolicies();
  }

  @Post('retention-policies')
  @Roles(Role.ADMIN)
  createRetentionPolicy(@Body() dto: CreateRetentionPolicyDto) {
    return this.svc.createRetentionPolicy(dto);
  }

  @Patch('retention-policies/:id')
  @Roles(Role.ADMIN)
  updateRetentionPolicy(@Param('id') id: string, @Body() dto: Partial<CreateRetentionPolicyDto>) {
    return this.svc.updateRetentionPolicy(id, dto);
  }

  @Delete('retention-policies/:id')
  @Roles(Role.ADMIN)
  deleteRetentionPolicy(@Param('id') id: string) {
    return this.svc.deleteRetentionPolicy(id);
  }

  // ── Document Types ────────────────────────────────────────────────────────

  @Get('document-types')
  listDocumentTypes() {
    return this.svc.listDocumentTypes();
  }

  @Post('document-types')
  @Roles(Role.ADMIN)
  createDocumentType(@Body() dto: CreateDocumentTypeDto) {
    return this.svc.createDocumentType(dto);
  }

  @Patch('document-types/:id')
  @Roles(Role.ADMIN)
  updateDocumentType(@Param('id') id: string, @Body() dto: Partial<CreateDocumentTypeDto>) {
    return this.svc.updateDocumentType(id, dto);
  }

  @Delete('document-types/:id')
  @Roles(Role.ADMIN)
  deleteDocumentType(@Param('id') id: string) {
    return this.svc.deleteDocumentType(id);
  }

  // ── Cabinets ──────────────────────────────────────────────────────────────

  @Get('search')
  @ApiOperation({ summary: 'Global search across cabinets, folders, sub-dividers and documents' })
  search(@Query('q') q: string, @CurrentUser() u: JwtPayload) {
    return this.svc.search(u, q ?? '');
  }

  @Get('cabinet-templates')
  listCabinetTemplates() {
    return this.svc.listTemplates();
  }

  @Get('cabinets')
  listCabinets(@CurrentUser() u: JwtPayload, @Query('scope') scope?: string) {
    return this.svc.listCabinets(u, scope);
  }

  @Post('cabinets')
  @Roles(Role.ADMIN)
  createCabinet(@Body() dto: CreateCabinetDto, @CurrentUser() u: JwtPayload) {
    return this.svc.createCabinet(dto, u);
  }

  @Post('cabinets/from-template')
  @Roles(Role.ADMIN)
  createCabinetFromTemplate(@Body() dto: CreateFromTemplateDto, @CurrentUser() u: JwtPayload) {
    return this.svc.createFromTemplate(dto, u);
  }

  @Get('cabinets/:id')
  getCabinet(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.getCabinet(id, u);
  }

  @Patch('cabinets/:id')
  @Roles(Role.ADMIN)
  updateCabinet(@Param('id') id: string, @Body() dto: UpdateCabinetDto) {
    return this.svc.updateCabinet(id, dto);
  }

  @Delete('cabinets/:id')
  @Roles(Role.ADMIN)
  deleteCabinet(@Param('id') id: string) {
    return this.svc.deleteCabinet(id);
  }

  // ── Cabinet ACLs ──────────────────────────────────────────────────────────

  @Get('cabinets/:id/acls')
  @Roles(Role.ADMIN)
  getCabinetAcls(@Param('id') id: string) {
    return this.svc.listAcls('cabinet', id);
  }

  @Post('cabinets/:id/acls')
  @Roles(Role.ADMIN)
  setCabinetAcl(@Param('id') id: string, @Body() dto: SetAclDto) {
    return this.svc.setAcl('cabinet', id, dto);
  }

  @Delete('cabinets/:id/acls/:aclId')
  @Roles(Role.ADMIN)
  removeCabinetAcl(@Param('aclId') aclId: string) {
    return this.svc.removeAcl(aclId);
  }

  // ── Folders (under a cabinet) ─────────────────────────────────────────────

  @Post('cabinets/:cabinetId/folders')
  @Roles(Role.ADMIN, Role.OFFICER)
  createRootFolder(@Param('cabinetId') cabinetId: string, @Body() dto: CreateFolderDto) {
    return this.svc.createFolder(cabinetId, dto);
  }

  // ── Folders (standalone) ──────────────────────────────────────────────────

  @Get('folders/:id')
  getFolder(@Param('id') id: string) {
    return this.svc.getFolder(id);
  }

  @Patch('folders/:id')
  @Roles(Role.ADMIN, Role.OFFICER)
  updateFolder(@Param('id') id: string, @Body() dto: UpdateNameDto) {
    return this.svc.updateFolder(id, dto.name);
  }

  @Patch('folders/:id/move')
  @Roles(Role.ADMIN, Role.OFFICER)
  moveFolder(@Param('id') id: string, @Body() dto: MoveFolderDto) {
    return this.svc.moveFolder(id, dto);
  }

  @Delete('folders/:id')
  @Roles(Role.ADMIN)
  deleteFolder(@Param('id') id: string) {
    return this.svc.deleteFolder(id);
  }

  @Post('folders/:folderId/children')
  @Roles(Role.ADMIN, Role.OFFICER)
  async createChildFolder(@Param('folderId') folderId: string, @Body() dto: CreateFolderDto) {
    const parent = await this.svc.getFolder(folderId);
    return this.svc.createFolder(parent.cabinetId, { name: dto.name, parentId: folderId });
  }

  // ── Folder ACLs ───────────────────────────────────────────────────────────

  @Get('folders/:id/acls')
  @Roles(Role.ADMIN)
  getFolderAcls(@Param('id') id: string) {
    return this.svc.listAcls('folder', id);
  }

  @Post('folders/:id/acls')
  @Roles(Role.ADMIN)
  setFolderAcl(@Param('id') id: string, @Body() dto: SetAclDto) {
    return this.svc.setAcl('folder', id, dto);
  }

  @Delete('folders/:id/acls/:aclId')
  @Roles(Role.ADMIN)
  removeFolderAcl(@Param('aclId') aclId: string) {
    return this.svc.removeAcl(aclId);
  }

  // ── Sub-Dividers ──────────────────────────────────────────────────────────

  @Post('folders/:folderId/sub-dividers')
  @Roles(Role.ADMIN, Role.OFFICER)
  createSubDivider(@Param('folderId') folderId: string, @Body() dto: CreateSubDividerDto) {
    return this.svc.createSubDivider(folderId, dto);
  }

  @Patch('sub-dividers/:id')
  @Roles(Role.ADMIN, Role.OFFICER)
  updateSubDivider(@Param('id') id: string, @Body() dto: UpdateNameDto) {
    return this.svc.updateSubDivider(id, dto.name);
  }

  @Patch('sub-dividers/:id/move')
  @Roles(Role.ADMIN, Role.OFFICER)
  moveSubDivider(@Param('id') id: string, @Body() dto: MoveSubDividerDto) {
    return this.svc.moveSubDivider(id, dto.folderId);
  }

  @Delete('sub-dividers/:id')
  @Roles(Role.ADMIN)
  deleteSubDivider(@Param('id') id: string) {
    return this.svc.deleteSubDivider(id);
  }
}
