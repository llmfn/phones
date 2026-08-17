import type { SiteConfig } from '$lib/site-config';

declare global {
  namespace App {
    interface Locals {
      config: SiteConfig;
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
        EMAIL?: EmailService;
      };
    }
  }
}

export {};
