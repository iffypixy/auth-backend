import {Module} from "@nestjs/common";
import {TypeOrmModule} from "@nestjs/typeorm";

import {UserService} from "./services";
import {User} from "./entities";

@Module({
  imports: [
    TypeOrmModule.forFeature([User])
  ],
  providers: [UserService],
  exports: [UserService]
})
export class UserModule {
}