import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { DocumentType } from '../prisma/client';
import { DocumentsService } from './documents.service';
import { UpdateDocumentDto } from './dto/document.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.documents.list(user.userId);
  }

  @Get('quota')
  quota(@CurrentUser() user: AuthUser) {
    return this.documents.quota(user.userId);
  }

  @Delete()
  removeAll(@CurrentUser() user: AuthUser) {
    return this.documents.removeAll(user.userId);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string', enum: Object.values(DocumentType) },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type?: DocumentType,
    @Body('label') label?: string,
    @Body('status') status?: string,
    @Body('educationLevel') educationLevel?: string,
  ) {
    return this.documents.upload(user.userId, file, type, label, { status, educationLevel });
  }

  @Post(':id/replace')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  replace(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type?: DocumentType,
    @Body('label') label?: string,
    @Body('status') status?: string,
    @Body('educationLevel') educationLevel?: string,
  ) {
    return this.documents.replace(user.userId, id, file, type, label, { status, educationLevel });
  }

  @Patch(':id')
  updateMeta(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documents.updateMeta(user.userId, id, dto);
  }

  @Get(':id/extraction')
  extraction(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.getExtraction(user.userId, id);
  }

  @Get(':id/file')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.documents.file(user.userId, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename.replace(/"/g, '')}"`);
    res.send(file.buffer);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.get(user.userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.remove(user.userId, id);
  }
}
