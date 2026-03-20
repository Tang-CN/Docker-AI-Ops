import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";

@Injectable()
export class ValidateIdPipe implements PipeTransform<any> {
  transform(value: any) {
    // 接受 string 或 number 等类型，统一转换为字符串并 trim
    if (value === undefined || value === null) {
      throw new BadRequestException("container id is required");
    }
    const str = String(value).trim();
    if (str === "") {
      throw new BadRequestException("container id is required");
    }
    return str;
  }
}
