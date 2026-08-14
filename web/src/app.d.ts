declare global {
  namespace App {
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
