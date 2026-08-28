import { Provider } from '@nestjs/common';
import { Pool } from 'pg';

export const DATABASE_POOL = 'DATABASE_POOL';

export const databaseProviders: Provider[] = [
  {
    provide: DATABASE_POOL,
    useFactory: () => {
      return new Pool({
        connectionString: process.env.DATABASE_URL,
      });
    },
  },
];