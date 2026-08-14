const SENDER = 'login@phones.llmfn.com';

export async function deliverLoginCode(
  email: string,
  code: string,
  emailService: App.EmailService | undefined,
  development: boolean,
  log: (message: string) => void = console.info
): Promise<void> {
  if (development) {
    log(`Login code for ${email}: ${code}`);
    return;
  }

  if (!emailService) throw new Error('EMAIL binding is required');

  await emailService.send({
    to: email,
    from: SENDER,
    subject: 'Your Phones verification code',
    text: `Your Phones verification code is ${code}. It expires in five minutes.`,
    html: `<p>Your Phones verification code is:</p><p><strong>${code}</strong></p><p>It expires in five minutes.</p>`
  });
}
