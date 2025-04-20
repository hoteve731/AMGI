import React from 'react';
// 다른 기존 import...

// 콘텐츠 제한 전역 상태 및 관리 
export const ContentLimitManager = {
    isSubscriptionModalOpen: false,
    setSubscriptionModalOpen: (isOpen: boolean) => {
        ContentLimitManager.isSubscriptionModalOpen = isOpen;
        if (isOpen) {
            // 구독 모달이 열릴 때 커스텀 이벤트 발생
            const event = new CustomEvent('showSubscriptionModal');
            window.dispatchEvent(event);
        }
    },
    // 바텀시트 열기 시도 처리 함수
    handleBottomSheetOpen: async (): Promise<boolean> => {
        try {
            // 콘텐츠 수 확인
            const response = await fetch('/api/contents', { credentials: 'include' });
            if (!response.ok) {
                console.error('콘텐츠 정보를 불러오는데 실패했습니다.', response.status);
                return true; // 에러 발생 시 기본적으로 바텀시트 열기 허용
            }

            const data = await response.json();
            const contentCount = data.contents?.length || 0;

            console.log(`현재 콘텐츠 수: ${contentCount}`);

            // 콘텐츠 수가 5개 이상이면 구독 모달 표시
            if (contentCount >= 5) {
                console.log('콘텐츠 한도 초과: 구독 모달 표시');
                ContentLimitManager.setSubscriptionModalOpen(true);
                return false; // 바텀시트 열기 불허
            }

            return true; // 바텀시트 열기 허용
        } catch (error) {
            console.error('콘텐츠 제한 확인 중 오류 발생:', error);
            return true; // 에러 발생 시 기본적으로 바텀시트 열기 허용
        }
    }
};

// App 컴포넌트 (기존 코드 유지)
function App() {
    // 기존 컴포넌트 내용...
}

export default App; 