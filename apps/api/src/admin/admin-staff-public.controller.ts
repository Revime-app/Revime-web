import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  acceptStaffInvitationInputSchema,
  type AcceptStaffInvitationInput,
  type AdminRole,
  type VerifyStaffInvitationResponse,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminStaffInvitationsService } from './admin-staff-invitations.service.js';

@Controller('admin/staff/invitations/public')
export class AdminStaffPublicController {
  constructor(private readonly staffInvitations: AdminStaffInvitationsService) {}

  @Get('verify')
  async verify(@Query('token') token: string): Promise<VerifyStaffInvitationResponse> {
    return this.staffInvitations.verifyToken(token);
  }

  @Post('accept')
  @HttpCode(200)
  async accept(
    @Body(new ZodValidationPipe(acceptStaffInvitationInputSchema)) body: AcceptStaffInvitationInput,
  ): Promise<{ ok: true; email: string; role: AdminRole }> {
    return this.staffInvitations.acceptInvitation(body);
  }
}
