import { handleProxyRequest } from '../_proxyHandler';

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  return handleProxyRequest(context.request);
};
