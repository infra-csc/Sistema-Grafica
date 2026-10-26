import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const msal = vi.hoisted(() => ({ getAuthCodeUrl: vi.fn(), acquireTokenByCode: vi.fn() }));
vi.mock('@azure/msal-node', () => ({ ConfidentialClientApplication: class {
  getAuthCodeUrl = msal.getAuthCodeUrl;
  acquireTokenByCode = msal.acquireTokenByCode;
} }));
import { microsoftConfig, registerMicrosoftAuth } from '../microsoft-auth';

const tenant = '11111111-1111-1111-1111-111111111111';
const routes = new Map<string, any>();
const findUser = vi.fn(); const issueExchange = vi.fn();
const graph = vi.fn();
function setup() {
  routes.clear();
  registerMicrosoftAuth({ get: (path: string, handler: any) => routes.set(path, handler) } as any, {findUser, issueExchange});
}
function request() {
  return { query: {}, session: { save: (cb: any) => cb(), microsoftLogin: {
    state: 'state-valid', nonce: 'nonce-valid', verifier: 'verifier', createdAt: Date.now(),
  } } } as any;
}
function response() {
  return { setHeader: vi.fn(), redirect: vi.fn(), json: vi.fn() };
}
async function callback(req = request()) {
  req.query = {code:'code',state:'state-valid',...req.query};
  const res = response();
  await routes.get('/api/auth/microsoft/callback')(req,res);
  return res;
}
beforeEach(() => {
  vi.stubEnv('MICROSOFT_TENANT_ID',tenant);
  vi.stubEnv('MICROSOFT_CLIENT_ID','22222222-2222-2222-2222-222222222222');
  vi.stubEnv('MICROSOFT_CLIENT_SECRET','secret-server-only');
  vi.stubEnv('MICROSOFT_REDIRECT_URI','https://grafica.appsnorte.com/api/auth/microsoft/callback');
  vi.clearAllMocks();
  msal.getAuthCodeUrl.mockResolvedValue('https://login.microsoftonline.com/authorize');
  msal.acquireTokenByCode.mockResolvedValue({accessToken:'access',idTokenClaims:{tid:tenant,nonce:'nonce-valid',oid:'identity-id'}});
  graph.mockResolvedValue({ok:true,json:async()=>({id:'identity-id',mail:'person@example.com'})});
  vi.stubGlobal('fetch',graph);
  findUser.mockResolvedValue('existing-user'); issueExchange.mockResolvedValue('one-use');
  setup();
});
afterEach(() => {vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('Microsoft direto na Grafica', () => {
  it('recusa tenant generico e redirect HTTP', () => {
    expect(microsoftConfig({...process.env,MICROSOFT_TENANT_ID:'common'})).toBeNull();
    expect(microsoftConfig({...process.env,MICROSOFT_REDIRECT_URI:'http://grafica.appsnorte.com/api/auth/microsoft/callback'})).toBeNull();
  });
  it('nao inicia login sem configuracao',async()=>{
    vi.stubEnv('MICROSOFT_CLIENT_SECRET',''); setup();
    const res=response(); await routes.get('/api/auth/microsoft')(request(),res);
    expect(res.redirect).toHaveBeenCalledWith('/login?error=microsoft_not_configured');
    expect(msal.getAuthCodeUrl).not.toHaveBeenCalled();
  });
  it('persiste state/nonce e envia PKCE S256',async()=>{
    const req=request(),res=response();
    await routes.get('/api/auth/microsoft')(req,res);
    expect(msal.getAuthCodeUrl).toHaveBeenCalledWith(expect.objectContaining({
      codeChallengeMethod:'S256',state:req.session.microsoftLogin.state,nonce:req.session.microsoftLogin.nonce,
    }));
    expect(req.session.microsoftLogin.verifier.length).toBeGreaterThanOrEqual(43);
    expect(res.redirect).toHaveBeenCalledWith('https://login.microsoftonline.com/authorize');
  });
  it.each(['wrong','expired'])('recusa estado %s antes de trocar codigo',async mode=>{
    const req=request(); if(mode==='wrong')req.query.state='wrong'; else req.session.microsoftLogin.createdAt-=601000;
    expect((await callback(req)).redirect).toHaveBeenCalledWith('/login?error=microsoft_invalid_state');
    expect(msal.acquireTokenByCode).not.toHaveBeenCalled();
  });
  it.each(['tid','nonce'])('recusa claim %s divergente',async field=>{
    msal.acquireTokenByCode.mockResolvedValue({accessToken:'access',idTokenClaims:{tid:tenant,nonce:'nonce-valid',oid:'identity-id',[field]:'wrong'}});
    expect((await callback()).redirect).toHaveBeenCalledWith('/login?error=microsoft_failed');
    expect(findUser).not.toHaveBeenCalled();
  });
  it('recusa identidade Graph divergente',async()=>{
    graph.mockResolvedValue({ok:true,json:async()=>({id:'wrong',mail:'person@example.com'})});
    expect((await callback()).redirect).toHaveBeenCalledWith('/login?error=microsoft_failed');
    expect(findUser).not.toHaveBeenCalled();
  });
  it('nao cria conta para email desconhecido',async()=>{
    findUser.mockResolvedValue(null);
    expect((await callback()).redirect).toHaveBeenCalledWith('/login?error=sso_user_not_found');
    expect(issueExchange).not.toHaveBeenCalled();
  });
  it('usa identidade Microsoft e impede reutilizacao',async()=>{
    const req=request(); req.query.email='forged@example.com';
    expect((await callback(req)).redirect).toHaveBeenCalledWith('/?sso_exchange=one-use');
    expect(findUser).toHaveBeenCalledWith('person@example.com');
    expect(issueExchange).toHaveBeenCalledWith('existing-user');
    expect(msal.acquireTokenByCode).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'nonce-valid', codeVerifier: 'verifier' }));
    expect((await callback(req)).redirect).toHaveBeenCalledWith('/login?error=microsoft_invalid_state');
    expect(msal.acquireTokenByCode).toHaveBeenCalledTimes(1);
  });
});
