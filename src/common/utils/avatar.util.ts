import * as crypto from 'crypto';
import { S3Service } from '@/modules/s3/s3.service';

export function resolveAvatarUrl(
  user: { avatarKey: string | null; email: string },
  s3Service: S3Service,
): string {
  if (user.avatarKey) {
    if (user.avatarKey.startsWith('http')) {
      return user.avatarKey;
    }
    return s3Service.getPublicUrl(user.avatarKey);
  }
  const emailHash = crypto
    .createHash('md5')
    .update(user.email.toLowerCase().trim())
    .digest('hex');
  return `https://www.gravatar.com/avatar/${emailHash}?s=200&d=identicon&r=g`;
}
