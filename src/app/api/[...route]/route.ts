import { app } from '@/lib/apiApp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handle = (req: Request) => app.fetch(req);

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS
};
