import { ApiProperty } from "@nestjs/swagger";
import { IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { DeviceDto } from "./device.dto";


export class RefreshTokenDto {

    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh.token.example.signature',
    })
    @IsString()
    refreshToken!: string;

    @ApiProperty({
        example: '7ab3ca44-0db4-46cc-8ee4-cf4ef35de30b',
        description: 'Server-side device id',
    })
    @IsString()
    deviceId!: string;

    @ApiProperty({type: DeviceDto})
    @ValidateNested()
    @Type(() => DeviceDto)
    device!: DeviceDto;
}