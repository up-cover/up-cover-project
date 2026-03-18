import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
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
}
