// Copyright (c) 2026, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import {describe, expect, it} from 'vitest';

import {linkOcamlAstToSource} from '../lib/compilers/ocaml.js';

function link(text: string) {
    return linkOcamlAstToSource(text.split('\n').map(line => ({text: line})));
}

function span(fromLine: number, fromCol: number, toLine: number, toCol: number) {
    return {from: {line: fromLine, col: fromCol}, to: {line: toLine, col: toCol}};
}

describe('OCaml AST view', () => {
    it('links each node of an OCaml 5 parse tree to its source range', () => {
        // `ocamlopt -i -dparsetree` for "let square x =\n  x * x\n", shortened
        const lines = link(
            [
                '[',
                '  structure_item (<source>[1,0+0]..[2,15+7])',
                '    Pstr_value Nonrec',
                '    [',
                '      <def>',
                '        pattern (<source>[1,0+4]..[1,0+10])',
                '          Ppat_var "square" (<source>[1,0+4]..[1,0+10])',
                '        expression (<source>[1,0+11]..[2,15+7]) ghost',
                '          Pexp_function',
                '          Pfunction_body',
                '            expression (<source>[2,15+2]..[2,15+7])',
                '              Pexp_apply',
                '              expression (<source>[2,15+4]..[2,15+5])',
                '                Pexp_ident "*" (<source>[2,15+4]..[2,15+5])',
                '    ]',
                ']',
            ].join('\n'),
        );
        expect(lines[0].source).toBeUndefined();
        expect(lines[1].source).toEqual(span(1, 1, 2, 7));
        // lines without a location belong to the node they are indented under
        expect(lines[2].source).toEqual(span(1, 1, 2, 7));
        expect(lines[6].source).toEqual(span(1, 5, 1, 10));
        expect(lines[8].source).toEqual(span(1, 12, 2, 7));
        expect(lines[11].source).toEqual(span(2, 3, 2, 7));
        expect(lines[13].source).toEqual(span(2, 5, 2, 5));
        expect(lines[14].source).toEqual(span(1, 1, 2, 7));
        expect(lines[15].source).toBeUndefined();
    });

    it('reads the location format of OCaml 3.12 and 4.00', () => {
        const lines = link(
            ['        pattern (<source>[1,0+4]..<source>[1,0+10])', '          Ppat_var "square"'].join('\n'),
        );
        expect(lines[0].source).toEqual(span(1, 5, 1, 10));
        expect(lines[1].source).toEqual(span(1, 5, 1, 10));
    });

    it('does not link locations in other files', () => {
        const lines = link('  expression (_none_[1,0+0]..[1,0+3])');
        expect(lines[0].source).toBeUndefined();
    });

    it('keeps error lines as they are', () => {
        const error = {text: 'Error: Syntax error', tag: {line: 2, column: 0, text: 'Syntax error', severity: 3}};
        expect(linkOcamlAstToSource([error as any])).toEqual([error]);
    });
});
