import { IsOptional, IsString, IsNumber } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    middleName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsString()
    bio?: string;

    @IsOptional()
    @IsNumber()
    inspectionPrice?: number;

    @IsOptional()
    @IsNumber()
    inspectionDuration?: number;
}