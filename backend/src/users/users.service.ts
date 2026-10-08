import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, User } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Phones listed in ADMIN_PHONES are promoted to ADMIN on signup and on every
   * login, so the first admin can be bootstrapped without touching the database.
   */
  private adminPhones(): string[] {
    return (this.config.get<string>('ADMIN_PHONES', '') ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  private roleForPhone(phone: string): Role {
    return this.adminPhones().includes(phone) ? Role.ADMIN : Role.USER;
  }

  findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Keeps an existing account's role in sync with ADMIN_PHONES. */
  async syncRole(user: User): Promise<User> {
    const expected = this.roleForPhone(user.phone);
    if (user.role === expected || expected !== Role.ADMIN) return user;
    return this.prisma.user.update({ where: { id: user.id }, data: { role: expected } });
  }

  createFromPhone(phone: string, name?: string) {
    const display = name?.trim() || `User ${phone.slice(-4)}`;
    const initials = display
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return this.prisma.user.create({
      data: {
        phone,
        name: display,
        avatarInitials: initials || phone.slice(-2).toUpperCase(),
        role: this.roleForPhone(phone),
        onboardingComplete: false,
        profile: {
          create: {
            name: display,
            completionPercent: 15,
          },
        },
      },
    });
  }

  toPublic(user: User) {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatarInitials: user.avatarInitials,
      role: user.role,
      isDemo: user.isDemo,
      onboardingComplete: user.onboardingComplete,
      createdAt: user.createdAt,
    };
  }
}
