import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { I18nService } from '../i18n/i18n.service';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { SanitizePipe } from './sanitize.pipe';

function host(lang?: string) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = {
    headers: { 'accept-language': lang },
    method: 'GET',
    requestId: 'req-1',
    route: { path: '/x' },
  };
  const h = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { h, res };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter(new I18nService());
  jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

  it('renders AppException as the envelope with a translated message', () => {
    const { h, res } = host('ar');
    filter.catch(new AppException('AUTH_INVALID_CREDENTIALS'), h);
    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message_key: 'errors.AUTH_INVALID_CREDENTIALS',
      },
      meta: { request_id: 'req-1' },
    });
    expect(body.error.message).toMatch(/[؀-ۿ]/); // Arabic script
  });

  it('maps unknown errors to INTERNAL_ERROR without leaking the message', () => {
    const { h, res } = host();
    filter.catch(new Error('password=hunter2 connection refused'), h);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('hunter2');
  });

  it('maps framework 404s to ROUTE_NOT_FOUND', () => {
    const { h, res } = host();
    filter.catch(new NotFoundException(), h);
    expect(res.json.mock.calls[0][0].error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('translates validation issue messages', () => {
    const { h, res } = host('fr');
    filter.catch(
      new AppException('VALIDATION_FAILED', [
        {
          field: 'email',
          errors: [{ rule: 'isEmail', message_key: 'validation.isEmail' }],
        },
      ]),
      h,
    );
    expect(res.json.mock.calls[0][0].error.details[0].errors[0].message).toBe(
      'Adresse e-mail invalide.',
    );
  });
});

describe('SanitizePipe', () => {
  const pipe = new SanitizePipe();

  it('trims strings and strips control characters in body/query', () => {
    const out = pipe.transform(
      { name: '  Amina\u0000\u0007 ', nested: { a: ' x ' }, list: [' y '] },
      { type: 'body' },
    ) as any;
    expect(out).toEqual({ name: 'Amina', nested: { a: 'x' }, list: ['y'] });
  });

  it('leaves passwords, tokens and codes untouched', () => {
    const out = pipe.transform(
      { password: '  p@ss  ', refresh_token: ' t ', code: ' 123456 ' },
      { type: 'body' },
    ) as any;
    expect(out).toEqual({
      password: '  p@ss  ',
      refresh_token: ' t ',
      code: ' 123456 ',
    });
  });

  it('drops prototype-pollution keys', () => {
    const out = pipe.transform(
      JSON.parse('{"__proto__":{"admin":true},"a":1}'),
      { type: 'body' },
    ) as any;
    expect(Object.keys(out)).toEqual(['a']);
    expect(({} as any).admin).toBeUndefined();
  });

  it('ignores route params', () => {
    expect(pipe.transform(' id ', { type: 'param' })).toBe(' id ');
  });
});
