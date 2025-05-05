import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  
  // URL에서 사용자 ID 파라미터 가져오기
  const url = new URL(request.url);
  const userIdParam = url.searchParams.get('userId');
  
  // 세션에서 사용자 ID 가져오기 시도
  const { data: { session } } = await supabase.auth.getSession();
  
  // 세션이 있으면 세션의 사용자 ID 사용, 없으면 파라미터에서 가져온 ID 사용
  const userId = session?.user?.id || userIdParam;
  
  // 사용자 ID가 없으면 오류 반환
  if (!userId) {
    console.error('No user ID provided');
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  // 사용자의 콘텐츠 확인
  const { data: userContents, error: contentsError } = await supabase
    .from('contents')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (contentsError) {
    console.error('Error checking user contents:', contentsError);
    return NextResponse.json({ error: 'Failed to check user contents' }, { status: 500 });
  }

  // 사용자에게 콘텐츠가 있으면 아무것도 하지 않음
  if (userContents && userContents.length > 0) {
    return NextResponse.json({ hasDefaultContent: true });
  }

  // 기본 콘텐츠 하드코딩 (테이블 사용 대신)
  const defaultContents = [
    {
      title: 'Loopa: Knowledge & Note Organizer',
      original_text: 'Welcome to loopa!\n\nloopa is the perfect space for organizing your thoughts, ideas, and tasks. This clean, intuitive platform allows you to capture anything that comes to mind and organize it efficiently.\n\nWith loopa, you can create notes with an easy-to-use interface. Highlight important content and structure it in a way that makes sense to you. Never miss a brilliant idea again - capture it in loopa whenever inspiration strikes.\n\nThe flashcards feature, available in the flashcards tab, helps you create learning cards effortlessly. This is particularly useful for exam preparation, language learning, or memorizing important concepts.\n\nloopa excels at knowledge management. You can easily understand and organize complex concepts, connect related information to build a systematic knowledge network, and quickly find what you need with the search function.\nGetting started is simple: write a new note to capture your ideas, use tags and categories to structure your content, create flashcards for important concepts, and regularly review and update your notes.\n\nWith loopa, there is nothing you can\'t understand.\n\nEven the most complex concepts and vast amounts of information can be clearly organized. loopa is always here to support your knowledge management journey.\n\nStart creating your first note today!',
      chunks: [],
      masked_chunks: [],
      status: 'studying',
      processing_status: 'completed',
      additional_memory: '',
      icon: '📝',
      markdown_text: '# 📚 Welcome to loopa!\n\n**loopa** is the ideal platform for organizing your thoughts, ideas, and tasks with ease. Its clean and intuitive interface allows you to capture and structure information efficiently.\n\n---\n\n## 🌟 Key Features of loopa\n\n### 1. Note Creation and Organization\n- **Easy-to-use interface** for creating notes\n- Highlight important content\n- Structure notes in a way that makes sense to you\n- Never miss a brilliant idea—capture it instantly\n\n### 2. Flashcards\n- Available in the **Flashcards tab**\n- Create learning cards effortlessly\n- Ideal for:\n  - Exam preparation\n  - Language learning\n  - Memorizing key concepts\n\n### 3. Knowledge Management\n- Simplifies understanding and organizing complex concepts\n- Connect related information to build a **systematic knowledge network**\n- Quickly find information using the **search function**\n\n---\n\n## 🚀 Getting Started with loopa\n\n1. Write a new note to capture your ideas\n2. Use **tags** and **categories** to structure your content\n3. Create **flashcards** for important concepts\n4. Regularly **review and update** your notes\n\n---\n\n## 💡 Why Choose loopa?\n\n- Supports understanding of **even the most complex concepts**\n- Handles **vast amounts of information** with clarity\n- Always available to assist your **knowledge management journey**\n\n---\n\n## 🎉 Start creating your first note today!'
    }
  ];
  
  console.log('Using hardcoded default content for user ID:', userId);

  // 각 기본 콘텐츠에 대해 사용자 콘텐츠 생성
  const createdContents = [];
  for (const defaultContent of defaultContents) {
    console.log('Creating content for user:', userId);
    
    // 콘텐츠 생성
    const { data: content, error: contentError } = await supabase
      .from('contents')
      .insert({
        user_id: userId,
        title: defaultContent.title,
        original_text: defaultContent.original_text,
        chunks: defaultContent.chunks ?? [],
        masked_chunks: defaultContent.masked_chunks ?? [],
        status: defaultContent.status || 'studying',
        additional_memory: defaultContent.additional_memory || '',
        processing_status: defaultContent.processing_status || 'completed',
        markdown_text: defaultContent.markdown_text || '',
        icon: defaultContent.icon || '📝'
      })
      .select('id')
      .single();

    if (contentError) {
      console.error('Error creating content:', contentError);
      console.error('Error details:', contentError.details, contentError.message, contentError.hint);
      return NextResponse.json({ error: 'Failed to create content', details: contentError }, { status: 500 });
    }
    
    console.log('Content created successfully with ID:', content.id);

    createdContents.push(content);

    // 그룹 생성
    const { data: group, error: groupError } = await supabase
      .from('content_groups')
      .insert({
        content_id: content.id,
        title: 'Welcome Guide',
        original_text: defaultContent.original_text,
        position: 0
      })
      .select('id')
      .single();

    if (groupError) {
      console.error('Error creating group:', groupError);
      console.error('Error details:', groupError.details, groupError.message, groupError.hint);
      return NextResponse.json({ error: 'Failed to create group', details: groupError }, { status: 500 });
    }
    
    console.log('Group created successfully with ID:', group.id);

    // 청크 생성
    const { error: chunkError } = await supabase
      .from('content_chunks')
      .insert({
        group_id: group.id,
        summary: 'Welcome to loopa guide',
        masked_text: defaultContent.markdown_text,
        position: 0,
        card_state: 'new',
        ease: 2.5,
        interval: 0,
        repetition_count: 0,
        status: 'active'
      });

    if (chunkError) {
      console.error('Error creating chunk:', chunkError);
      console.error('Error details:', chunkError.details, chunkError.message, chunkError.hint);
      return NextResponse.json({ error: 'Failed to create chunk', details: chunkError }, { status: 500 });
    }
    
    console.log('Chunk created successfully for group ID:', group.id);
  }

  return NextResponse.json({ 
    success: true, 
    message: 'Default contents created', 
    createdContents 
  });
}