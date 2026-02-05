import { Controller, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Admin Notifications')
@Controller('notifications')
export class NotificationServiceController {
  private readonly logger = new Logger(NotificationServiceController.name);
}
