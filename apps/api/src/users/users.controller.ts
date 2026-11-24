import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, UsePipes } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AllowBeforeCguAcceptance } from '../platform/allow-before-cgu-acceptance.decorator.js';
import {
  setAvatarSchema,
  setBannerSchema,
  signAvatarSchema,
  signBannerSchema,
  updateModesSchema,
  updateNotificationPreferencesSchema,
  updateRepairerCategoriesSchema,
  updateRepairerProfileSchema,
  updateRepairerSchema,
  updateUsernameSchema,
  updateAvailabilitySchema,
  type MeResponse,
  type MyParticularQuotaResponse,
  type SetAvatarInput,
  type SetBannerInput,
  type SignAvatarInput,
  type SignBannerInput,
  type SignPhotoResponse,
  type UpdateModesInput,
  type UpdateNotificationPreferencesInput,
  type UpdateRepairerCategoriesInput,
  type UpdateRepairerInput,
  type UpdateRepairerProfileInput,
  type UpdateUsernameInput,
  type UpdateAvailabilityInput,
  updateTourSchema,
  type TourState,
  type UpdateTourInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsersService } from './users.service.js';
import { SecurityService } from '../security/security.service.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly security: SecurityService,
  ) {}

  @Get('me')
  // V7 D5 (U9b): the app reads `cguVersion` here to know a re-acceptance is owed.
  @AllowBeforeCguAcceptance()
  me(@Session() session: UserSession): Promise<MeResponse> {
    return this.users.me(session.user.id);
  }

  /** V7 A10 (U7): the private individual's own CGU art. 53 counter; `quota` is null for a professional. */
  @Get('me/particular-quota')
  particularQuota(@Session() session: UserSession): Promise<MyParticularQuotaResponse> {
    return this.users.myParticularQuota(session.user.id);
  }

  // V9 B1 (`FND9-017`): the role step comes before the terms screen, so it must answer while a
  // forced re-acceptance is pending (it is ON in production).
  @Patch('me/modes')
  @AllowBeforeCguAcceptance()
  updateModes(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateModesSchema)) body: UpdateModesInput,
  ): Promise<MeResponse> {
    return this.users.updateModes(session.user.id, body);
  }

  /** V8 E2 (`DEC8-09` (2)): one mode's help-bubble state; the newer write wins (see the service). */
  @Patch('me/tour')
  updateTour(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateTourSchema)) body: UpdateTourInput,
  ): Promise<TourState> {
    return this.users.updateTour(session.user.id, body);
  }

  /**
   * `CF-47`. The three notification groups. Partial by design - see the service.
   */
  @Patch('me/notification-preferences')
  updateNotificationPreferences(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema))
    body: UpdateNotificationPreferencesInput,
  ): Promise<MeResponse> {
    return this.users.updateNotificationPreferences(session.user.id, body);
  }

  /**
   * `CF-23`. Mints a signed upload URL for a profile photo.
   *
   * 🛑 NOT `POST /demandes/photos/sign`, which cannot be reused: that route calls
   * `assertClientEnabled` and would refuse the réparateur-only account this feature was asked
   * for. See `UsersService.signAvatarUpload`.
   *
   * Every path segment is chosen by the server, so the request body carries only the content
   * type - there is no `draftId` because an avatar has no wizard to abandon.
   */
  @Post('me/avatar/sign')
  @HttpCode(201)
  signAvatar(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(signAvatarSchema)) body: SignAvatarInput,
  ): Promise<SignPhotoResponse> {
    return this.users.signAvatarUpload(session.user.id, body);
  }

  /**
   * `CF-23`. Points the profile at an uploaded object, or clears it when `path` is null.
   *
   * ONE route for set and remove rather than a PATCH plus a DELETE: both have to delete the
   * previous object, and two routes would be two places to forget it.
   */
  @Patch('me/avatar')
  setAvatar(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(setAvatarSchema)) body: SetAvatarInput,
  ): Promise<MeResponse> {
    return this.users.setAvatar(session.user.id, body);
  }

  /**
   * `CF-24`. Mints a signed upload URL for the réparateur's fiche-publique banner.
   *
   * 🛑 A THIRD SIGNING ROUTE RATHER THAN A FLAG ON THE AVATAR ONE, because the two differ in
   * AUTHORISATION and not merely in destination: this one refuses an account without réparateur
   * mode. See `UsersService.signBannerUpload` for why the gate is on the sign and not only on the
   * commit.
   */
  @Post('me/banner/sign')
  @HttpCode(201)
  signBanner(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(signBannerSchema)) body: SignBannerInput,
  ): Promise<SignPhotoResponse> {
    return this.users.signBannerUpload(session.user.id, body);
  }

  /**
   * `CF-24`. Points the réparateur profile at an uploaded banner, or clears it when `path` is null.
   *
   * ONE route for set and remove, matching `me/avatar`: both have to prune the prefix, and two
   * routes would be two places to forget it.
   */
  @Patch('me/banner')
  setBanner(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(setBannerSchema)) body: SetBannerInput,
  ): Promise<MeResponse> {
    return this.users.setBanner(session.user.id, body);
  }

  /**
   * `CF-25`. Replaces the réparateur's declared speciality set.
   *
   * PUT because the body IS the new set - « set this to exactly this ». The cap is checked in
   * the service, not by the schema, because only a normalised set can be counted.
   */
  @Put('me/categories')
  setCategories(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateRepairerCategoriesSchema)) body: UpdateRepairerCategoriesInput,
  ): Promise<MeResponse> {
    return this.users.setCategories(session.user.id, body);
  }

  /**
   * `CF-52`. His whole week, replaced. PUT rather than PATCH because the body IS the collection -
   * the same reasoning as `me/categories` one handler above.
   */
  @Put('me/availability')
  setAvailability(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateAvailabilitySchema)) body: UpdateAvailabilityInput,
  ): Promise<MeResponse> {
    return this.users.setAvailability(session.user.id, body);
  }

  /** The public handle. Presentation for a réparateur is `me/repairer-profile`. */
  @Patch('me/username')
  // V9 B1: the username step is the first completion step, before any acceptance.
  @AllowBeforeCguAcceptance()
  updateUsername(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateUsernameSchema)) body: UpdateUsernameInput,
  ): Promise<MeResponse> {
    return this.users.updateUsername(session.user.id, body);
  }

  /** Geography only. Presentation - displayName and bio - is `me/repairer-profile`. */
  @Patch('me/repairer')
  updateRepairer(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateRepairerSchema)) body: UpdateRepairerInput,
  ): Promise<MeResponse> {
    return this.users.updateRepairer(session.user.id, body);
  }

  /**
   * Separate from `me/repairer`, which owns geography and overwrites all four of its
   * fields on every call. See the service for why the two cannot be one route.
   */
  @Patch('me/repairer-profile')
  updateRepairerProfile(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateRepairerProfileSchema)) body: UpdateRepairerProfileInput,
  ): Promise<MeResponse> {
    return this.users.updateRepairerProfile(session.user.id, body);
  }

  /**
   * `CF-47`. Soft-deletes the caller's account. Apple guideline 5.1.1(v).
   *
   * 🛑 204 AND NOT `MeResponse`, breaking this file's convention deliberately: there is
   * no `me` left to describe, and handing back a scrubbed user would invite a screen to
   * render it.
   */
  @Delete('me')
  @HttpCode(204)
  // V7 D5 (U9b, Q11): refusing the new CGU means leaving, so deletion stays open.
  @AllowBeforeCguAcceptance()
  async deleteAccount(@Session() session: UserSession): Promise<void> {
    // V7 A11 (U2b, Q6 / Q8): the password (or a code) again, once the switch is on. V9 U3: for an account
    // linked to Apple or Google, its provider (switch STEP_UP_PROVIDER_ENFORCED); the confirmation is what
    // the deletion revokes with.
    const confirmation = await this.security.assertDeletionConfirmed({ userId: session.user.id, sessionId: session.session.id });
    await this.users.deleteAccount(session.user.id, { revoke: { source: 'SELF', confirmation } });
  }
}
