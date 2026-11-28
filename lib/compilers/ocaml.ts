// Copyright (c) 2018, Eugen Bulavin
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

import type {PreliminaryCompilerInfo} from '../../types/compiler.interfaces.js';
import type {ParseFiltersAndOutputOptions} from '../../types/features/filters.interfaces.js';
import type {ResultLine} from '../../types/resultline/resultline.interfaces.js';
import {BaseCompiler} from '../base-compiler.js';
import {CompilationEnvironment} from '../compilation-env.js';
import {PascalParser} from './argument-parsers.js';

// A node's location in OCaml's tree dumps: `(<source>[line,bol+col]..[line,bol+col])`, with the file name repeated
// before the end position in OCaml 3.x and 4.00. Columns are 0-based and the end is exclusive.
const locationRe = /\(<source>\[(\d+),\d+\+(\d+)\]\.\.(?:<source>)?\[(\d+),\d+\+(\d+)\]\)/;

type SourceRange = {from: {line: number; col: number}; to: {line: number; col: number}};

// Links each line of the dump to the source range of its node. Lines without a location (constructors, brackets)
// belong to the closest node above them that is indented less.
export function linkOcamlAstToSource(dump: ResultLine[]): ResultLine[] {
    const enclosing: {indent: number; source: SourceRange}[] = [];
    return dump.map(line => {
        const indent = line.text.search(/\S/);
        while (enclosing.length > 0 && enclosing[enclosing.length - 1].indent >= indent) enclosing.pop();
        const match = locationRe.exec(line.text);
        let source = enclosing.length > 0 ? enclosing[enclosing.length - 1].source : undefined;
        if (match) {
            const [fromLine, fromCol, toLine, toCol] = match.slice(1).map(Number);
            // The AST pane wants 1-based columns, ending at the start of the node's last character.
            source = {from: {line: fromLine, col: fromCol + 1}, to: {line: toLine, col: Math.max(toCol, 1)}};
            enclosing.push({indent, source});
        }
        // TODO: ResultLineSource doesn't have to/from (as in llvm-ast.ts)
        return source ? {...line, source: source as any} : line;
    });
}

export class OCamlCompiler extends BaseCompiler {
    static get key() {
        return 'ocaml';
    }

    constructor(compilerInfo: PreliminaryCompilerInfo, env: CompilationEnvironment) {
        super(compilerInfo, env);
        // override output base because ocaml's -S -o has different semantics.
        // namely, it outputs a full binary exe to the supposed asm dump.
        // with this override and optionsForFilter override, that pecularity..
        // ..is bypassed entirely.
        this.outputFilebase = 'example';
    }

    override getSharedLibraryPathsAsArguments() {
        return [];
    }

    override optionsForFilter(filters: ParseFiltersAndOutputOptions, outputFileName: string) {
        const options = ['-g'];
        if (filters.binary) {
            options.unshift('-o', outputFileName);
        } else {
            options.unshift('-S', '-c');
        }
        return options;
    }

    override getArgumentParserClass() {
        return PascalParser;
    }

    override couldSupportASTDump(_version: string) {
        // Every OCaml version on Compiler Explorer (3.12.1 onward) has `-dparsetree`.
        return true;
    }

    override async generateAST(inputFilename: string, options: string[]): Promise<ResultLine[]> {
        // `-dparsetree` prints the parse tree to stderr, and `-i` stops after type checking (printing the inferred
        // interface to stdout), so nothing is written next to the real compilation's output. The flags go first
        // because older versions compile each file as soon as they reach it on the command line.
        const result = await this.runCompiler(
            this.compiler.exe,
            ['-i', '-dparsetree', ...options],
            this.filename(inputFilename),
            this.getDefaultExecOptions(),
        );
        // On a type error the tree is followed by the error; on a syntax error there is only the error.
        return linkOcamlAstToSource(result.stderr);
    }
}
