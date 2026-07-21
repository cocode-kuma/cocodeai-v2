import Image from "next/image";

type Props = {
  className?: string;
};

export function OpenCodeLogo(props: Props) {
  return (
    <Image
      src="/opencode-wordmark.svg"
      alt=""
      aria-hidden="true"
      className={props.className}
      width={174}
      height={42}
      unoptimized
    />
  );
}
