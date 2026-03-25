export function OrdersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
      <path
        d="M7 4h10l2 4v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8l2-4Zm0 4h10M9 12h6M9 16h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LendingIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
      <path
        d="M7 7h10v4H7V7Zm-2 6h14v9H5v-9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 11v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ApprovalsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
      <path
        d="M9 11.5 11 14l4-5M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AdministrationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="7" cy="6" r="1.5" fill="currentColor" />
      <circle cx="17" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
      <path
        d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
      <path
        d="M6.5 6h14l-1.4 7.2a2 2 0 0 1-2 1.6H9.1a2 2 0 0 1-2-1.6L5.7 3.8A1.5 1.5 0 0 0 4.2 2.6H3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="19" r="1.5" fill="currentColor" />
      <circle cx="17.5" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function PinIcon({
  filled = false,
  size = 20,
  className = "",
}: {
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  const style = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    display: "block",
  } as const;

  return filled ? (
    <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    style={style}
    >
    <g transform="translate(0,-1)">
      <path
        d="M 17.1218 1.8702 C 15.7573 0.5057 13.4779 0.7658 12.4558 2.4026 L 9.6106 6.9592 C 9.6103 6.9596 9.6091 6.9617 9.6038 6.9655 C 9.5973 6.9702 9.5834 6.9782 9.56 6.9848 C 9.509 6.9992 9.4423 6.9981 9.3828 6.976 C 8.4117 6.616 6.7448 6.2205 5.0139 6.8725 C 4.0813 7.2238 3.616 8.0322 3.5652 8.8524 C 3.5169 9.635 3.8329 10.4395 4.4143 11.0208 L 7.9497 14.5563 L 1.2697 21.2363 C 0.8792 21.6269 0.8792 22.26 1.2697 22.6506 C 1.6603 23.0411 2.2934 23.0411 2.6839 22.6506 L 9.364 15.9705 L 12.8995 19.5061 C 13.4808 20.0874 14.2853 20.4035 15.0679 20.3551 C 15.8881 20.3044 16.6966 19.839 17.0478 18.9065 C 17.6998 17.1755 17.3043 15.5086 16.9444 14.5375 C 16.9223 14.478 16.9212 14.4114 16.9355 14.3603 C 16.9421 14.337 16.9502 14.3231 16.9549 14.3165 C 16.9587 14.3112 16.9606 14.31 16.9611 14.3098 L 21.5177 11.4645 C 23.1546 10.4424 23.4147 8.1631 22.0501 6.7985 L 17.1218 1.8702 Z Z"
        fill="currentColor"
      />
    </g>
    </svg>
  ) : (
    <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    style={style}
    >
    <g transform="translate(0,-1)">
      <path
        d="M17.1218 1.87023C15.7573 0.505682 13.4779 0.76575 12.4558 2.40261L9.61062 6.95916C9.61033 6.95965 9.60913 6.96167 9.6038 6.96549C9.59728 6.97016 9.58336 6.97822 9.56001 6.9848C9.50899 6.99916 9.44234 6.99805 9.38281 6.97599C8.41173 6.61599 6.74483 6.22052 5.01389 6.87251C4.08132 7.22378 3.61596 8.03222 3.56525 8.85243C3.51687 9.63502 3.83293 10.4395 4.41425 11.0208L7.94975 14.5563L1.26973 21.2363C0.879206 21.6269 0.879206 22.26 1.26973 22.6506C1.66025 23.0411 2.29342 23.0411 2.68394 22.6506L9.36397 15.9705L12.8995 19.5061C13.4808 20.0874 14.2853 20.4035 15.0679 20.3551C15.8881 20.3044 16.6966 19.839 17.0478 18.9065C17.6998 17.1755 17.3043 15.5086 16.9444 14.5375C16.9223 14.478 16.9212 14.4114 16.9355 14.3603C16.9421 14.337 16.9502 14.3231 16.9549 14.3165C16.9587 14.3112 16.9606 14.31 16.9611 14.3098L21.5177 11.4645C23.1546 10.4424 23.4147 8.16307 22.0501 6.79853L17.1218 1.87023ZM14.1523 3.46191C14.493 2.91629 15.2528 2.8296 15.7076 3.28445L20.6359 8.21274C21.0907 8.66759 21.0041 9.42737 20.4584 9.76806L15.9019 12.6133C14.9572 13.2032 14.7469 14.3637 15.0691 15.2327C15.3549 16.0037 15.5829 17.1217 15.1762 18.2015C15.1484 18.2752 15.1175 18.3018 15.0985 18.3149C15.0743 18.3316 15.0266 18.3538 14.9445 18.3589C14.767 18.3699 14.5135 18.2916 14.3137 18.0919L5.82846 9.6066C5.62872 9.40686 5.55046 9.15333 5.56144 8.97583C5.56651 8.8937 5.58877 8.84605 5.60548 8.82181C5.61855 8.80285 5.64516 8.7719 5.71886 8.74414C6.79869 8.33741 7.91661 8.56545 8.68762 8.85128C9.55668 9.17345 10.7171 8.96318 11.3071 8.01845L14.1523 3.46191Z"
        fill="currentColor"
      />
    </g>
    </svg>
  );
}
