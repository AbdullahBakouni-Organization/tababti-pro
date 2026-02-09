// dto/device-info.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class DeviceInfoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  deviceId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  deviceName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  deviceType: string; // mobile | desktop | tablet

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  platform: string; // ios | android | web | windows | macos | linux
}
