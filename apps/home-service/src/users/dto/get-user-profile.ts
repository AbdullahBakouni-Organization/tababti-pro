import { City, Gender } from '@app/common/database/schemas/common.enums';
import { ApiProperty } from '@nestjs/swagger';

export class UserProfileResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  gender: Gender;

  @ApiProperty()
  DataofBirth: Date;

  @ApiProperty()
  city: City;

  @ApiProperty({ required: false })
  profileImage?: string;
}
