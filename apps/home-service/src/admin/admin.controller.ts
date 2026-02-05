import {
  Controller,
  Post,
  Put,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { AdminService } from './admin.service';

import { AdminSignInDto } from './dto/admin-signin.dto';

import type { Response } from 'express';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Admin Sign In
  @Post('signin')
  async signIn(
    @Body() dto: AdminSignInDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.adminService.signIn(dto, res);
  }
}
