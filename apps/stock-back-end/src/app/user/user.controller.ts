import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('account')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async getAccount(@Request() req) {
    const userId = req.user.userId;
    const user = await this.userService.findById(userId);
    const positions = await this.userService.getUserPositions(userId);

    return {
      balance: user.balance,
      positions: [positions],
    };
  }
}