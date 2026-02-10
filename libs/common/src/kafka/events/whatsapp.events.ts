export interface WhatsappSendMessageEvent {
  phone: string;
  text: string;
  lang?: 'ar' | 'en';
}

export interface WhatsappSendOtpEvent {
  phone: string;
  otp: string;
  lang?: 'ar' | 'en';
}
