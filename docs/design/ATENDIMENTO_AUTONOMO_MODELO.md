# Atendimento autônomo — o modelo, e por que ele é assim

Desenho para a IA atender **fora do horário comercial** e operar **uma fatia da
operação definida pelo diretor**, de modo que as duas frentes possam ser
comparadas com honestidade.

Tudo aqui se apoia no que **já existe** no repositório. Onde eu proponho algo
novo, digo que é novo. Onde os dados não sustentam, digo que não sustentam.

---

## 1. O caso, medido — não estimado

Três números do banco de produção, em 02/08/2026:

| medido | valor |
|---|---|
| demanda orgânica que chega **fora** do horário comercial (19h–7h59) | **57%** (118 de 207) |
| tempo **mediano** entre a lead entrar e alguém tocar nela | **92,8 horas** |
| leads com esse tempo mensurável | 444 |

> A conta exclui a hora 19, que tem 283 leads em 10 dias (28,3/dia) contra
> ~1,2/dia nas outras — é o pico da importação de planilha, não demanda. Sem
> excluir, o número viraria 82% e seria mentira.

**Quase quatro dias de mediana.** A lead que chega às 23h de sexta espera o fim
de semana inteiro. É esse o buraco, e é ele que justifica a IA — não o entusiasmo
com IA.

---

## 2. O modelo — quatro degraus, e o degrau é por AÇÃO, não por agente

O padrão de mercado hoje (champion/challenger com autonomia graduada) tem quatro
degraus. O repositório **já tem os dois primeiros construídos**:

| degrau | o que a IA faz | estado aqui |
|---|---|---|
| **1. Sombra** | prepara tudo, **nada sai**; compara-se o que ela faria com o que o humano fez | `lib/ai/modo-sombra.ts` — 5 ações retidas |
| **2. Assistida** | propõe, humano aprova cada envio | `governed-nightly-copilot` + `/approvals` |
| **3. Supervisionada** | age sozinha dentro de um cerco, humano audita depois | **falta** |
| **4. Autônoma** | age sozinha e só escala exceção | **teto: nunca passa de `qualification`** |

O que **não** muda em nenhum degrau — já declarado em
`lib/ai/niveis-de-autonomia.ts`, sete ações proibidas ao nível máximo:

`apagar_dado` · `mudar_permissao` · `retirar_rls` · `disparo_em_massa` ·
`prometer_financiamento` · `garantir_preco_ou_estoque` · `acao_irreversivel`

**A regra que sustenta o resto:** o degrau é declarado por **ação**, não por
agente. "A IA está no nível 3" é uma frase sem sentido operacional — o que existe
é "a IA pode responder mensagem sozinha (3) e não pode enviar proposta (proibido)".

---

## 3. A fatia do diretor — e o erro que a arruinaria

O pedido é "um percentual definido pelo diretor". A mecânica correta:

### O sorteio acontece na ENTRADA, e é cego

Quando a lead entra, ela recebe um braço — `ia` ou `humano` — por sorteio
determinístico sobre o id dela, contra o percentual vigente. **Ninguém escolhe
qual lead vai para a IA.**

```
braço = hash(lead.id + semente_do_experimento) % 100 < percentual_ia ? "ia" : "humano"
```

**Por que cego:** se o gestor puder escolher, ele vai — consciente ou não — mandar
para a IA o que parece frio e guardar o quente para a equipe. A comparação então
mede a triagem dele, não a IA. Este é o modo de falhar mais comum deste tipo de
experimento, e ele não dá erro: dá um resultado bonito e falso.

**Por que determinístico:** a mesma lead cai sempre no mesmo braço. Reprocessar
não a move, e o braço é auditável depois pelo id.

### A fatia é por FAIXA, não global

Um único percentual global mistura coisas incomparáveis. O diretor define a fatia
por faixa, e cada faixa é um experimento próprio:

| faixa | sugestão inicial | por quê |
|---|---|---|
| fora do expediente | **100% IA** | não há com quem comparar: hoje o humano responde em ~93h |
| expediente, lead nova | **10–30%** | é aqui que a comparação acontece |
| lead com negociação aberta | **0%** | acima do teto da IA |

> A primeira faixa **não é experimento**, é cobertura: com 0% de atendimento
> humano à noite, não existe grupo de controle. Chamá-la de "teste" seria
> inventar um comparativo que não existe.

---

## 4. A comparação — e aqui está o achado mais duro

**A comparação NÃO pode ser por conversão.** Não por opinião: por aritmética.

A base tem **2 vendas em 490 leads** (0,41%). Para detectar com 80% de confiança
que um braço converte 50% melhor que o outro, seriam necessárias cerca de
**15.600 leads por braço** — mais de 31 mil no total. Ao ritmo orgânico atual
(~30/mês), isso é medida de anos.

Um painel que mostrasse "IA: 0,6% · Humano: 0,4%" com esses volumes estaria
mostrando **ruído com duas casas decimais**. Uma venda a mais num braço vira uma
diferença de 50%.

### O que dá para comparar, com o volume que existe

| métrica | eventos hoje | serve? |
|---|---|---|
| **tempo até o primeiro toque** | 444 | **sim** — é a melhor |
| taxa de resposta do cliente | a instrumentar | sim, alto volume |
| leads que chegam a `contato` | 33 | fraca |
| leads que chegam a `qualificacao` | 10 | não |
| **vendas** | **2** | **não** |

A métrica principal é **tempo até o primeiro toque**, e o efeito esperado é
enorme: de ~93h para minutos. Efeito grande com N grande é o único cenário em que
um experimento pequeno conclui alguma coisa.

### Intenção de tratar

Lead sorteada para a IA que pede um humano **recebe o humano imediatamente** — e
**continua contando no braço da IA**. Move-la de braço seria remover do resultado
justamente os casos em que a IA não deu conta, o que faria o número dela subir por
construção.

---

## 5. As guardas que não são negociáveis

1. **A IA se identifica.** Na primeira mensagem, sem eufemismo. Não é só ética: é
   o que evita a conversa em que o cliente descobre depois e perde a confiança.
2. **Teto em `qualification`.** Proposta, condição comercial e preço são humanos.
   Já declarado e guardado por portão (28 controles).
3. **Palavra de escape.** "Quero falar com uma pessoa" tira a IA da conversa na
   hora — e o pedido vira evidência no experimento.
4. **Silêncio é humano.** Se a IA não sabe, ela escala. Não inventa.
5. **Botão de parada.** O diretor zera o percentual e o efeito é imediato, sem
   deploy. A mesma forma do `ATLAS_OUTBOX_PAUSADO` que já existe.
6. **Todo envio deixa rastro** no livro de execuções (`atlas_worker_runs`), com
   braço, desfecho e duração.

---

## 6. O acoplamento com o site Atlas

O site vai ser unido ao CRM, e a regra que já foi decidida vale aqui inteira:

> **Portal e CRM compartilham os mesmos identificadores** — `leadId`, `brokerId`,
> `developmentId`.

Consequência para este desenho: o braço (`ia` / `humano`) é atributo **da lead**,
não da origem. Uma pessoa que começa no site e continua no WhatsApp permanece no
mesmo braço, e a conversa é uma só. Se o braço fosse por canal, a mesma pessoa
seria contada duas vezes e em braços diferentes.

O site é o melhor lugar para o primeiro degrau: quem está no site **já está
esperando resposta imediata**, e ali a IA compete com um formulário que não
responde nada — não com um corretor.

---

## 7. O que falta construir, na ordem

1. **Instrumentar o braço** — coluna/atributo na lead, sorteado no intake.
   Sem isso não há experimento, só impressão.
2. **A fatia por faixa**, editável pelo diretor, com efeito imediato.
3. **Degrau 3 (supervisionada)** para a faixa noturna — hoje o copiloto é
   assistido e trava esperando aprovação que ninguém dá às 3h.
4. **O painel de comparação**, com a métrica certa e a recusa escrita de mostrar
   conversão enquanto não houver volume.
5. **Ligar o copiloto noturno**: ele existe, tem teto, tem aprovação — e nunca
   rodou. `ai_sales_journeys` tem **zero** linhas.

---

## 8. O que este documento NÃO resolve

- **Não há template de WhatsApp aprovado.** `message_templates` com
  `status='approved'` tem **zero** linhas, e é por isso que o `nightly-sales`
  responde 503 todo dia às 3h. Sem template oficial, a IA não fala com ninguém —
  nenhum degrau acima de sombra é alcançável.
- **A qualidade da conversa da IA não está medida.** Este desenho compara
  velocidade e progressão de etapa. Se ela responde *bem* é outra pergunta, e
  responder ela exige leitura humana de amostra.
- **Não desenhei a interface.** Só a mecânica e o que ela precisa provar.
