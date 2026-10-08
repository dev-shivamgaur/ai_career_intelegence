import { ApiProperty } from "@nestjs/swagger";
import { IsPhoneNumber, IsString, Length, ValidateNested } from "class-validator";
import {Type} from "class-transformer"
import { DeviceDto } from "./device.dto";



export class VerifyOtpDto {
    @ApiProperty({
        example: '+919760989122',
        description: 'Phone number in E.164 format',
    })
    @IsString()
    @IsPhoneNumber()
    phoneNumber!: string;

    @ApiProperty({
        example: '123456',
        minLength: 6,
        maxLength: 6,
        description: '6-digit OTP received on phone'
    })
    @IsString()
    @Length(6, 6)
    otp!: string;

    @ApiProperty({
        type: DeviceDto,
        example: {
            clientDeviceId: 'device-local-id-abc123',
      deviceName: "Shivam's Vivobook Pro",
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)...',
      os: 'windoOs',
      browser: 'Chrome',
      timezone: 'Asia/Kolkata',
      screenResolution: '1440x900',
        },
    })
    @ValidateNested()
    @Type(()=> DeviceDto)
    device!: DeviceDto
}