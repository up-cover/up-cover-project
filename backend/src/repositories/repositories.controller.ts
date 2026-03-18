import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
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

  @Get(':id/scan-log')
  async getScanLog(@Param('id') id: string) {
    const lines = await this.repositoriesService.getScanLog(id);
    return { lines };
  }
}
