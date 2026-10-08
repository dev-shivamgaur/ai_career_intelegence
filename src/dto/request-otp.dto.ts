import { ApiProperty } from "@nestjs/swagger";
import { IsPhoneNumber, IsString } from "class-validator";


export class RequestOtpDto {
    @ApiProperty({
        example: '+919760989122',
        description: 'Phone number is required in E.164 format',
    })
    @IsString()
    @IsPhoneNumber()
    phoneNumber!: string;
}
