import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [{ hashPassword }, { closePool }, { upsertSeedUser }] = await Promise.all([
    import("../src/lib/auth/password"),
    import("../src/lib/db"),
    import("../src/lib/db/queries"),
  ]);

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "123456";
  const passwordHash = hashPassword(password);

  const result = await upsertSeedUser(email, passwordHash);

  console.log(`${result.action === "created" ? "Created" : "Updated"} seed user: ${email}`);

  await closePool();
}

main()
  .catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ER_NO_SUCH_TABLE") {
      console.error("数据表不存在。请先执行 npm run db:push 初始化数据库。");
    }
    console.error(error);
    process.exitCode = 1;
  });