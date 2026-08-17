import type { AdminSession } from '$lib/server/admin-auth';
import type { Database } from '$lib/server/database';
import type { SiteConfig } from '$lib/site-config';

declare global {
  namespace App {
    interface Locals {
      config: SiteConfig;
      revision: number | null;
      admin?: AdminSession | null;
    }

    interface EmailService {
      send(message: {
        to: string;
        from: string;
        subject: string;
        text: string;
        html: string;
      }): Promise<{ messageId: string }>;
    }

    interface Platform {
      env: {
        AUTH_SECRET?: string;
        ADMIN_PASSCODE?: string;
        ADMIN_SESSION_SECRET?: string;
        OPENAI_API_KEY?: string;
        DB?: Database;
        EMAIL?: EmailService;
      };
    }
  }
}

export {};
