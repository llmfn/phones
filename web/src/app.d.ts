import type { Database } from '$lib/server/revisions';
import type { SiteConfig } from '$lib/site-config';

declare global {
  namespace App {
    interface Locals {
      config: SiteConfig;
      revision: number | null;
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
        OPENAI_API_KEY?: string;
        DB?: Database;
        EMAIL?: EmailService;
      };
    }
  }
}

export {};
