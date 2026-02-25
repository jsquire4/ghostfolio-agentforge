import { Type } from 'class-transformer';
import { IsIn, ValidateNested } from 'class-validator';

class HitlMatrixEntryDto {
  @IsIn(['auto-approve', 'confirm', 'block'])
  high: string;

  @IsIn(['auto-approve', 'confirm', 'block'])
  medium: string;

  @IsIn(['auto-approve', 'confirm', 'block'])
  low: string;
}

export class SetHitlMatrixDto {
  @ValidateNested()
  @Type(() => HitlMatrixEntryDto)
  read: HitlMatrixEntryDto;

  @ValidateNested()
  @Type(() => HitlMatrixEntryDto)
  write: HitlMatrixEntryDto;

  @ValidateNested()
  @Type(() => HitlMatrixEntryDto)
  analysis: HitlMatrixEntryDto;
}
