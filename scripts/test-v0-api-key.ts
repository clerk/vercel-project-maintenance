import "dotenv/config";
import { v0 } from "v0-sdk";

v0.user
  .get()
  .then((user) => {
    console.log(user);
  })
  .catch((error) => {
    console.error(error);
  });
