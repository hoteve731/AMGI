-- 사용자 정의 함수 생성 (필요한 경우에만)
CREATE OR REPLACE FUNCTION public.alter_table_drop_column(
  table_name text,
  column_name text
)
RETURNS void AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS %I', table_name, column_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- contents 테이블에서 status 열 삭제
ALTER TABLE public.contents DROP COLUMN IF EXISTS status;

-- 보안 정책 수정
-- 만약 RLS 정책이 status 컬럼을 참조하고 있다면 여기서 업데이트
-- 예: DROP POLICY IF EXISTS "Contents are viewable by user based on status" ON public.contents; 