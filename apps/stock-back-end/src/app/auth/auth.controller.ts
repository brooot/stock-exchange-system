import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { Response } from 'express';

class RegisterDto {
  @IsString()
  @MinLength(3, { message: '用户名至少3个字符' })
  @MaxLength(50, { message: '用户名最多50个字符' })
  username: string;

  @IsString()
  @MinLength(6, { message: '密码至少6个字符' })
  password: string;
}

class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body(ValidationPipe) registerDto: RegisterDto) {
    return this.authService.register(
      registerDto.username,
      registerDto.password
    );
  }

  @Post('login')
  async login(
    @Body(ValidationPipe) loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.login(
      loginDto.username,
      loginDto.password
    );

    // 设置httpOnly cookie
    response.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: false, // 允许HTTP连接，适用于IP访问
      sameSite: 'lax', // 放宽同站策略，适用于IP访问
      maxAge: 24 * 60 * 60 * 1000, // 24小时
      path: '/',
    });

    // 返回成功信息，不包含token
    return {
      message: '登录成功',
      username: loginDto.username,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    // 清除cookie
    response.clearCookie('access_token', {
      httpOnly: true,
      secure: false, // 允许HTTP连接，适用于IP访问
      sameSite: 'lax', // 放宽同站策略，适用于IP访问
      path: '/',
    });

    return {
      message: '退出登录成功',
    };
  }
}
