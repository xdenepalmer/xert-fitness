-- Reassert the announcement action invariant explicitly because SQL CHECK
-- constraints accept UNKNOWN results unless nullability is named directly.

alter table public.member_announcements
  drop constraint if exists member_announcements_cta_check;

alter table public.member_announcements
  add constraint member_announcements_cta_check check (
    (cta_label is null and cta_url is null)
    or (
      cta_label is not null
      and cta_url is not null
      and cta_label = btrim(cta_label)
      and char_length(cta_label) between 1 and 40
      and cta_label !~ '[[:cntrl:]]'
      and cta_url = btrim(cta_url)
      and char_length(cta_url) between 1 and 500
      and cta_url !~ '[[:cntrl:]]'
      and (
        (left(cta_url, 1) = '/' and left(cta_url, 2) <> '//')
        or (
          cta_url ~ '^https://'
          and split_part(split_part(cta_url, '://', 2), '/', 1) not like '%@%'
        )
      )
    )
  );
