import { describe, expect, it } from 'vitest';

import { mobileMenuKey } from '@/components/app-shell';
import { resolveTabValue } from '@/components/ui/Tabs';
import {
  shouldFinishCreateTemplate,
  shouldFinishUpdateTemplate,
} from '@/app/admin/playbooks/playbooks-manager';

describe('estado concorrente da UI no Next 16', () => {
  it('só fecha a edição quando a action concluída pertence à mesma instância ainda aberta', () => {
    expect(shouldFinishUpdateTemplate('template-b', 7, 'template-a', 7)).toBe(false);
    expect(shouldFinishUpdateTemplate('template-a', 8, 'template-a', 7)).toBe(false);
    expect(shouldFinishUpdateTemplate('template-a', 7, 'template-a', 7)).toBe(true);
  });

  it('não deixa uma criação antiga resetar um formulário de criação reaberto', () => {
    expect(shouldFinishCreateTemplate(8, 7)).toBe(false);
    expect(shouldFinishCreateTemplate(7, 7)).toBe(true);
  });

  it('troca a identidade do menu móvel em cada rota', () => {
    expect(mobileMenuKey('/dashboard')).not.toBe(mobileMenuKey('/conexoes'));
    expect(mobileMenuKey('/dashboard')).toBe('/dashboard');
  });

  it('aceita aba navegada válida e ignora valor ausente', () => {
    const ids = ['kanban', 'conexao'];
    expect(resolveTabValue(ids, 'conexao', 'kanban')).toBe('conexao');
    expect(resolveTabValue(ids, 'inexistente', 'kanban')).toBe('kanban');
  });
});
