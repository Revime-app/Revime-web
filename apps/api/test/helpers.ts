import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/** Unique per run so parallel developers do not collide in the shared demo database. */
export const uniqueEmail = (): string =>
  `test+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@repareme.test`;

/**
 * A French mobile in E.164, unique per call. `user.phone` is UNIQUE, so a fixed
 * fixture number would make the second signup in any suite fail.
 */
export const uniquePhone = (): string =>
  `+336${Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, '0')}`;

export async function signUp(app: INestApplication): Promise<{
  email: string;
  password: string;
  cookie: string;
}> {
  const email = uniqueEmail();
  const password = 'Motdepasse123';
  const res = await request(app.getHttpServer())
    .post('/api/auth/sign-up/email')
    .send({
      email,
      password,
      name: 'Test Utilisateur',
      firstName: 'Test',
      lastName: 'Utilisateur',
      phone: uniquePhone(),
    })
    .expect(200);
  const raw = res.headers['set-cookie'];
  const cookie = (Array.isArray(raw) ? raw : [raw ?? '']).map((c) => c.split(';')[0]).join('; ');
  return { email, password, cookie };
}

/**
 * A signed-up user with réparateur mode enabled. Enabling the mode also creates
 * the RepairerProfile row, via the upsert in UsersService.updateModes.
 */
export async function signUpRepairer(app: INestApplication): Promise<{
  email: string;
  cookie: string;
}> {
  const { email, cookie } = await signUp(app);
  await request(app.getHttpServer())
    .patch('/api/v1/users/me/modes')
    .set('Cookie', cookie)
    .send({ repairerEnabled: true })
    .expect(200);
  return { email, cookie };
}
