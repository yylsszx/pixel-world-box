import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  // #93 质感地基：色值纪律 —— src/lib/game 新代码禁止裸 hex，色值一律走 palette.ts 命名常量。
  // 白名单 = 存量迁移债（sprites 843 / render 147 / engine 64 / constants 30 / types 10 / emergence 16 /
  // tech 7 / items 5 / creations 1 处），M2-M5 各轮分批迁往 palette.ts 后逐一移出白名单。
  files: ["src/lib/game/**/*.ts", "src/lib/game/**/*.tsx"],
  ignores: [
    "src/lib/game/sprites.ts", "src/lib/game/render.ts", "src/lib/game/constants.ts", "src/lib/game/palette.ts",
    "src/lib/game/engine.ts", "src/lib/game/types.ts", "src/lib/game/tech.ts", "src/lib/game/emergence.ts",
    "src/lib/game/items.ts", "src/lib/game/creations.ts",
  ],
  rules: {
    "no-restricted-syntax": ["error", {
      selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
      message: "色值请用 src/lib/game/palette.ts 的命名常量（#93 质感地基：白名单存量文件外禁裸 hex）",
    }],
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "third_party/**", ".api-stash-export/**", ".next-export/**", "oracle-server/dsh-runtime/**"]
}];

export default eslintConfig;
