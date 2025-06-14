import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateFileDto {
    @IsString()
    @MinLength(1)
    @MaxLength(256)
    content: string;
}
