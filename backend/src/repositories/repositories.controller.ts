import { Controller, Post, Get, Delete, Param, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { RepositoriesService } from './repositories.service';
import { RegisterRepositoryDto } from './dto/register-repository.dto';

@Controller('repositories')
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterRepositoryDto) {
    return this.repositoriesService.register(dto.owner, dto.repo);
  }

  @Get()
  async findAll() {
    return this.repositoriesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.repositoriesService.findById(id);
  }

  @Get(':id/coverage-files')
  async getCoverageFiles(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.repositoriesService.getCoverageFiles(id, Math.max(1, parseInt(page, 10) || 1), Math.min(200, Math.max(1, parseInt(limit, 10) || 50)));
  }

  @Get(':id/scan-log')
  async getScanLog(@Param('id') id: string) {
    const lines = await this.repositoriesService.getScanLog(id);
    return { lines };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.repositoriesService.delete(id);
  }
}
