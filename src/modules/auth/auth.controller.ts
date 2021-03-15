import {BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {ConfigService} from "@nestjs/config";
import {Response, Request, CookieOptions} from "express";
import * as bcrypt from "bcrypt";
import {v4} from "uuid";

import {User, UserService, UserPublicData} from "@modules/user";
import {GetUser} from "./decorators";
import {IsAuthorizedGuard} from "./guards";
import {LoginDto, RegisterDto, RefreshTokensDto} from "./dtos";
import {RefreshSessionService} from "./services";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly refreshSessionService: RefreshSessionService,
    private readonly configService: ConfigService
  ) {
  }

  @HttpCode(201)
  @Post("register")
  async register(
    @Body() {firstName, lastName, login, password, fingerprint}: RegisterDto,
    @Res({passthrough: true}) res: Response
  ): Promise<{user: UserPublicData}> {
    const existedUser = await this.userService.findOne({login});

    if (existedUser) throw new BadRequestException("User with this login has been already registered.");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await this.userService.create({firstName, lastName, login, password: hashedPassword});

    const {accessToken, refreshToken} = await this.getJWTs(user, fingerprint);

    res.cookie("access-token", accessToken, this.accessTokenCookieOptions);
    res.cookie("refresh-token", refreshToken, this.refreshTokenCookieOptions);

    return {
      user: user.public
    };
  }

  @HttpCode(200)
  @Post("login")
  async login(
    @Body() {login, password, fingerprint}: LoginDto,
    @Res({passthrough: true}) res: Response
  ): Promise<{user: UserPublicData}> {
    const user = await this.userService.findOne({login});

    const error = new BadRequestException("Invalid credentials.");

    if (!user) throw error;

    const doPasswordsMatch = await bcrypt.compare(password, user.password);

    if (!doPasswordsMatch) throw error;

    await this.refreshSessionService.delete({fingerprint});

    const {accessToken, refreshToken} = await this.getJWTs(user, fingerprint);

    res.cookie("access-token", accessToken, this.accessTokenCookieOptions);
    res.cookie("refresh-token", refreshToken, this.refreshTokenCookieOptions);

    return {
      user: user.public
    };
  }

  @HttpCode(204)
  @Post("refresh-tokens")
  async refreshTokens(
    @Body() {fingerprint}: RefreshTokensDto,
    @Req() req: Request,
    @Res({passthrough: true}) res: Response
  ): Promise<void> {
    const error = new BadRequestException("Invalid refresh token");

    const token = req.cookies["refresh-token"];

    if (!token) throw error;

    const session = await this.refreshSessionService.findOne({fingerprint, token}, {relations: ["user"]});

    if (!session) throw error;

    const isExpired = Date.now() - Number(session.expiresAt) >= 0;

    if (isExpired) throw error;

    await this.refreshSessionService.remove(session);

    const {accessToken, refreshToken: newRefreshToken} = await this.getJWTs(session.user, fingerprint);

    res.cookie("access-token", accessToken, this.accessTokenCookieOptions);
    res.cookie("refresh-token", newRefreshToken, this.refreshTokenCookieOptions);
  }

  @UseGuards(IsAuthorizedGuard)
  @HttpCode(200)
  @Get("credentials")
  getCredentials(
    @GetUser() user: User
  ): {user: UserPublicData} {
    return {
      user: user.public
    };
  }

  @UseGuards(IsAuthorizedGuard)
  @HttpCode(204)
  @Post("logout")
  async logout(
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const token: string = req.cookies["refresh-token"];

    res.cookie("access-token", null);
    res.cookie("refresh-token", null);

    await this.refreshSessionService.delete({token});
  }

  get accessTokenCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      path: "/",
      maxAge: this.configService.get<number>("jwt.accessToken.expiresIn")
    };
  }

  get refreshTokenCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      path: "/api/auth",
      maxAge: this.configService.get<number>("jwt.refreshToken.expiresIn")
    };
  }

  async getJWTs(user: User, fingerprint: string): Promise<{accessToken: string; refreshToken: string}> {
    const refreshTokenExpiresIn = this.configService.get<number>("jwt.refreshToken.expiresIn");

    const accessToken = await this.jwtService.signAsync({userId: user.id});

    const refreshToken = await this.refreshSessionService.create({
      user, fingerprint, expiresAt: new Date(Date.now() + refreshTokenExpiresIn), token: v4()
    });

    return {
      accessToken, refreshToken: refreshToken.token
    };
  }
}